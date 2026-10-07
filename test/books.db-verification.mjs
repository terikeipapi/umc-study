// Opt-in integration check: build first, then run this file with --run.
// HTTP requests use real MySQL repositories in one transaction. Only newly
// inserted verification rows are rolled back; no DELETE, UPDATE, or DDL runs.
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

const fields = [
  'bookId',
  'categoryName',
  'description',
  'isAvailable',
  'title',
];
const silentLogger = {
  log() {},
  error() {},
  warn() {},
  debug() {},
  verbose() {},
};
let stage = 'opt-in';

class VerificationError extends Error {}

function check(condition, message) {
  if (!condition) throw new VerificationError(message);
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function snapshot(dataSource) {
  const books = await dataSource.query('SELECT * FROM book ORDER BY book_id');
  const categories = await dataSource.query(
    'SELECT * FROM category ORDER BY category_id',
  );
  const schema = {};
  for (const table of ['book', 'category']) {
    const [row] = await dataSource.query(`SHOW CREATE TABLE \`${table}\``);
    const definition = row['Create Table'];
    check(typeof definition === 'string', 'Table definition was unavailable');
    schema[table] = definition;
  }
  return {
    bookCount: books.length,
    categoryCount: categories.length,
    rowHash: fingerprint({ books, categories }),
    schemaHash: fingerprint(
      Object.fromEntries(
        Object.entries(schema).map(([table, definition]) => [
          table,
          definition.replace(
            /\bAUTO_INCREMENT=\d+\b/gu,
            'AUTO_INCREMENT=<counter>',
          ),
        ]),
      ),
    ),
    schema,
  };
}

function checkResponse(body) {
  check(
    JSON.stringify(Object.keys(body).sort()) === JSON.stringify(fields),
    'Response must contain exactly the five DTO fields',
  );
  check(typeof body.bookId === 'string', 'BIGINT bookId must be a string');
  check(typeof body.categoryName === 'string', 'Category name was not loaded');
  check(typeof body.isAvailable === 'boolean', 'Availability must be boolean');
  check(
    body.description === null || typeof body.description === 'string',
    'Description must be a string or null',
  );
}

async function main() {
  check(
    process.argv.includes('--run'),
    'Explicit opt-in required: node test/books.db-verification.mjs --run',
  );
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  stage = 'load compiled application';
  const { AppModule } = await import('../dist/app.module.js');
  const { DatabaseService } =
    await import('../dist/database/database.service.js');
  const { Book } = await import('../dist/library/entities/book.entity.js');
  const { Category } =
    await import('../dist/library/entities/category.entity.js');
  check(
    ['localhost', '127.0.0.1', '::1'].includes(
      process.env.DB_HOST || 'localhost',
    ),
    'This verification script requires a local development DB host',
  );
  check(Boolean(process.env.DB_NAME), 'DB_NAME is required');

  let initializedModule;
  let dataSource;
  let runner;
  let app;
  let before;
  let report;
  let failure;
  const cleanupFailures = [];

  try {
    stage = 'connect using AppModule TypeORM configuration';
    initializedModule = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(silentLogger)
      .compile();
    dataSource = initializedModule.get(getDataSourceToken());
    check(
      dataSource.options.synchronize === false &&
        dataSource.options.dropSchema === false &&
        dataSource.options.migrationsRun === false,
      'Automatic schema changes must remain disabled',
    );
    before = await snapshot(dataSource);
    check(
      /\bENGINE=InnoDB\b/iu.test(before.schema.book),
      'Book table must support transactional rollback',
    );

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const books = runner.manager.getRepository(Book);
    const categories = runner.manager.getRepository(Category);
    const existingCategories = await categories.find({
      order: { categoryId: 'ASC' },
    });
    const category = existingCategories.find((entry) => {
      const value = Number(entry.categoryId);
      return Number.isSafeInteger(value) && value > 0;
    });
    check(
      Boolean(category),
      'A category with a safe positive integer ID is required',
    );
    const categoryId = Number(category.categoryId);

    // Override only the DB session used by repositories. Controllers, services,
    // entities, DTOs, ORM configuration, and the HTTP adapter remain real.
    const transactionalModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .setLogger(silentLogger)
      .overrideProvider(getDataSourceToken())
      .useValue(dataSource)
      .overrideProvider(getRepositoryToken(Book))
      .useValue(books)
      .overrideProvider(getRepositoryToken(Category))
      .useValue(categories)
      .overrideProvider(DatabaseService)
      .useValue({ pool: {} })
      .compile();
    app = transactionalModule.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    const http = request(app.getHttpServer());
    const marker = `Books API verification ${randomUUID()}`;

    async function verifyList() {
      const expectedRows = await runner.query(
        `SELECT b.book_id, b.title, b.description, b.is_available, c.name
         FROM book b JOIN category c ON c.category_id = b.category_id
         ORDER BY b.book_id DESC`,
      );
      const response = await http.get('/books');
      check(response.status === 200, 'GET /books must return 200');
      check(Array.isArray(response.body), 'GET /books must return an array');
      const expected = expectedRows.map((row) => ({
        bookId: String(row.book_id),
        title: row.title,
        description: row.description,
        categoryName: row.name,
        isAvailable: Boolean(row.is_available),
      }));
      for (const body of response.body) checkResponse(body);
      check(
        fingerprint(response.body) === fingerprint(expected),
        'GET must include all books in descending ID order with category names',
      );
      return response.body;
    }

    stage = 'GET original books';
    const originalList = await verifyList();
    check(
      originalList.length === before.bookCount,
      'GET must include all original rows',
    );

    stage = 'POST with description';
    const created = await http.post('/books').send({
      categoryId,
      title: `${marker} with description`,
      description: 'Temporary integration verification',
    });
    check(created.status === 201, 'Valid POST must return 201');
    checkResponse(created.body);
    check(
      created.body.categoryName === category.name,
      'POST category name is incorrect',
    );
    check(created.body.isAvailable === true, 'New books must be available');
    const [stored] = await runner.query(
      'SELECT category_id, description, is_available FROM book WHERE book_id = ?',
      [created.body.bookId],
    );
    check(Boolean(stored), 'POST did not persist the new book');
    check(
      String(stored.category_id) === category.categoryId &&
        stored.description === 'Temporary integration verification' &&
        Boolean(stored.is_available) === true,
      'Persisted book fields do not match the request and defaults',
    );

    stage = 'POST omitted description and whitelist';
    const omitted = await http.post('/books').send({
      categoryId,
      title: `${marker} without description`,
      bookId: '9007199254740991',
      isAvailable: false,
      categoryName: 'Ignored request field',
      category: { categoryId: '9007199254740991' },
    });
    check(omitted.status === 201, 'POST without description must return 201');
    checkResponse(omitted.body);
    check(
      omitted.body.description === null &&
        omitted.body.isAvailable === true &&
        omitted.body.bookId !== '9007199254740991' &&
        omitted.body.categoryName === category.name,
      'Omitted description or whitelist behavior is incorrect',
    );
    const [withoutDescription] = await runner.query(
      'SELECT category_id, description, is_available FROM book WHERE book_id = ?',
      [omitted.body.bookId],
    );
    check(
      withoutDescription?.description === null,
      'Omitted description must persist as SQL NULL',
    );

    stage = 'POST unknown category';
    const knownIds = new Set(
      existingCategories.map((entry) => entry.categoryId),
    );
    let missingCategoryId = Number.MAX_SAFE_INTEGER;
    while (knownIds.has(String(missingCategoryId))) missingCategoryId -= 1;
    const countBeforeInvalid = await books.count();
    const missingCategoryRequest = {
      categoryId: missingCategoryId,
      title: `${marker} missing category`,
    };
    const missing = await http.post('/books').send(missingCategoryRequest);
    check(missing.status === 404, 'Unknown category must return 404');
    check(
      (await books.count()) === countBeforeInvalid,
      'Unknown category must not save a book',
    );

    stage = 'POST invalid requests';
    const invalidRequests = [
      ['missing categoryId', { title: marker }],
      ['null categoryId', { categoryId: null, title: marker }],
      ['empty categoryId', { categoryId: '', title: marker }],
      ['whitespace categoryId', { categoryId: '  ', title: marker }],
      ['fractional categoryId', { categoryId: 1.5, title: marker }],
      [
        'numeric string categoryId',
        { categoryId: String(categoryId), title: marker },
      ],
      ['missing title', { categoryId }],
      ['empty title', { categoryId, title: '' }],
      ['whitespace title', { categoryId, title: ' \t\n ' }],
      ['long title', { categoryId, title: 'a'.repeat(101) }],
      ['null description', { categoryId, title: marker, description: null }],
      ['numeric description', { categoryId, title: marker, description: 123 }],
    ];
    let invalidTitleEvidence;
    for (const [label, body] of invalidRequests) {
      const response = await http.post('/books').send(body);
      check(response.status === 400, `${label} must return 400`);
      if (label === 'whitespace title') {
        invalidTitleEvidence = {
          request: body,
          status: response.status,
          body: response.body,
        };
      }
    }
    check(
      (await books.count()) === countBeforeInvalid,
      'Invalid requests must not save books',
    );

    stage = 'GET includes unavailable books';
    let unavailableControlInserted = false;
    if (!originalList.some((entry) => !entry.isAvailable)) {
      await books.save(
        books.create({
          category,
          title: `${marker} unavailable control`,
          description: null,
          isAvailable: false,
        }),
      );
      unavailableControlInserted = true;
    }
    const finalList = await verifyList();
    check(
      finalList.some((entry) => !entry.isAvailable),
      'GET must include unavailable books',
    );
    check(
      finalList.length ===
        before.bookCount + 2 + Number(unavailableControlInserted),
      'GET must not limit the number of books',
    );
    report = {
      ok: true,
      connection: 'AppModule real MySQL connection; local development host',
      http: 'Real Nest HTTP adapter; real repositories using one transaction',
      originalBookCount: before.bookCount,
      categoryCount: before.categoryCount,
      checks: {
        getAllDescendingWithCategoryAndFiveFields: true,
        unavailableBooksIncluded: true,
        post201WithFiveFields: true,
        omittedDescriptionStoredAsNull: true,
        newBooksAvailableAndExtraFieldsIgnored: true,
        unknownCategory404WithoutInsert: true,
        invalidRequests400WithoutInsert: invalidRequests.length,
      },
      temporaryRowsInserted: 2 + Number(unavailableControlInserted),
      temporaryTitlePrefix: marker,
      autoIncrementMayAdvance: true,
      captureEvidence: {
        existingCategory: { categoryId, categoryName: category.name },
        initialGet: { status: 200, body: originalList },
        postWithDescription: { status: created.status, body: created.body },
        postWithoutDescription: { status: omitted.status, body: omitted.body },
        invalidTitle: invalidTitleEvidence,
        missingCategory: {
          request: missingCategoryRequest,
          status: missing.status,
          body: missing.body,
        },
        generatedBooksPersistedInTransaction: [
          {
            bookId: created.body.bookId,
            categoryId: String(stored.category_id),
            description: stored.description,
            isAvailable: Boolean(stored.is_available),
          },
          {
            bookId: omitted.body.bookId,
            categoryId: String(withoutDescription.category_id),
            description: withoutDescription.description,
            isAvailable: Boolean(withoutDescription.is_available),
          },
        ],
      },
    };
  } catch (error) {
    failure = error;
  } finally {
    async function clean(label, action) {
      try {
        await action();
      } catch {
        cleanupFailures.push(label);
      }
    }
    if (runner?.isTransactionActive) {
      await clean('transaction rollback', () => runner.rollbackTransaction());
    }
    if (before && dataSource?.isInitialized && !runner?.isTransactionActive) {
      await clean('row and schema preservation check', async () => {
        const after = await snapshot(dataSource);
        check(
          after.rowHash === before.rowHash,
          'Original book/category rows changed',
        );
        check(
          after.schemaHash === before.schemaHash,
          'Table structure changed',
        );
        if (report) {
          report.originalRowsUnchanged = true;
          report.tableStructuresUnchanged = true;
          report.allTemporaryRowsRolledBack = true;
        }
      });
    }
    if (runner) await clean('query runner release', () => runner.release());
    if (app) await clean('HTTP app close', () => app.close());
    if (initializedModule) {
      await clean('initial module close', () => initializedModule.close());
    }
    if (dataSource?.isInitialized) {
      await clean('data source close', () => dataSource.destroy());
    }
  }
  check(
    cleanupFailures.length === 0,
    `Cleanup failed: ${cleanupFailures.join(', ')}`,
  );
  if (failure) throw failure;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        stage,
        error:
          error instanceof VerificationError
            ? error.message
            : 'Application or DB verification failed',
        code: typeof error?.code === 'string' ? error.code : null,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
