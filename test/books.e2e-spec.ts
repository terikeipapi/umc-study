import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { Book } from '../src/library/entities/book.entity.js';
import { Category } from '../src/library/entities/category.entity.js';

describe('Books API (mock repositories)', () => {
  let app: INestApplication;
  const bookRepository = {
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };
  const categoryRepository = { findOneBy: vi.fn() };
  const category = Object.assign(new Category(), {
    categoryId: '2',
    name: 'Fiction',
  });
  const responseFields = [
    'bookId',
    'categoryName',
    'description',
    'isAvailable',
    'title',
  ];

  function book(bookId: string, title: string, isAvailable = true): Book {
    return Object.assign(new Book(), {
      bookId,
      title,
      description: null,
      isAvailable,
      category,
      book_id: bookId,
      category_id: category.categoryId,
    });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    bookRepository.find.mockResolvedValue([]);
    categoryRepository.findOneBy.mockResolvedValue(category);
    bookRepository.create.mockImplementation((input: Partial<Book>) =>
      Object.assign(new Book(), input),
    );
    bookRepository.save.mockImplementation(async (input: Book) =>
      Object.assign(input, { bookId: '10' }),
    );

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        options: { type: 'mysql' },
        getRepository: (entity: unknown) => {
          if (entity === Book) return bookRepository;
          if (entity === Category) return categoryRepository;
          throw new Error('Unexpected repository');
        },
        manager: {},
        isInitialized: false,
      })
      .overrideProvider(DatabaseService)
      .useValue({ pool: { execute: vi.fn(), getConnection: vi.fn() } })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists all books with category names in descending ID order', async () => {
    bookRepository.find.mockResolvedValue([
      book('9007199254740993', 'Newest', false),
      book('2', 'Earlier'),
      book('1', 'Oldest'),
    ]);

    const response = await request(app.getHttpServer())
      .get('/books')
      .expect(200);

    expect(bookRepository.find).toHaveBeenCalledExactlyOnceWith({
      relations: { category: true },
      order: { bookId: 'DESC' },
    });
    expect(response.body).toEqual([
      {
        bookId: '9007199254740993',
        title: 'Newest',
        description: null,
        categoryName: 'Fiction',
        isAvailable: false,
      },
      {
        bookId: '2',
        title: 'Earlier',
        description: null,
        categoryName: 'Fiction',
        isAvailable: true,
      },
      {
        bookId: '1',
        title: 'Oldest',
        description: null,
        categoryName: 'Fiction',
        isAvailable: true,
      },
    ]);
    for (const result of response.body as Record<string, unknown>[]) {
      expect(Object.keys(result).sort()).toEqual(responseFields);
    }
  });

  it('returns an empty list when no books exist', async () => {
    await request(app.getHttpServer()).get('/books').expect(200, []);
  });

  it('creates a book and returns only the five response fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/books')
      .send({ categoryId: 2, title: 'New Book', description: 'Synopsis' })
      .expect(201);

    expect(categoryRepository.findOneBy).toHaveBeenCalledExactlyOnceWith({
      categoryId: '2',
    });
    expect(bookRepository.create).toHaveBeenCalledExactlyOnceWith({
      title: 'New Book',
      description: 'Synopsis',
      isAvailable: true,
      category,
    });
    expect(bookRepository.save).toHaveBeenCalledOnce();
    expect(bookRepository.save.mock.calls[0][0]).toBeInstanceOf(Book);
    expect(response.body).toEqual({
      bookId: '10',
      title: 'New Book',
      description: 'Synopsis',
      categoryName: 'Fiction',
      isAvailable: true,
    });
    expect(Object.keys(response.body).sort()).toEqual(responseFields);
  });

  it('keeps the response ID a string when the driver returns a numeric insert ID', async () => {
    bookRepository.save.mockImplementation(async (input: Book) =>
      Object.assign(input, { bookId: 10 }),
    );

    const response = await request(app.getHttpServer())
      .post('/books')
      .send({ categoryId: 2, title: 'Numeric Insert ID' })
      .expect(201);

    expect(response.body.bookId).toBe('10');
    expect(Object.keys(response.body).sort()).toEqual(responseFields);
  });

  it('stores an omitted description as null and ignores extra request fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/books')
      .send({
        categoryId: 2,
        title: 'Without Description',
        bookId: '500',
        isAvailable: false,
        categoryName: 'Injected Category',
        category: { categoryId: '99' },
      })
      .expect(201);

    expect(bookRepository.create).toHaveBeenCalledExactlyOnceWith({
      title: 'Without Description',
      description: null,
      isAvailable: true,
      category,
    });
    expect(bookRepository.save.mock.calls[0][0].description).toBeNull();
    expect(response.body).toEqual({
      bookId: '10',
      title: 'Without Description',
      description: null,
      categoryName: 'Fiction',
      isAvailable: true,
    });
    expect(Object.keys(response.body).sort()).toEqual(responseFields);
  });

  it('accepts a title of exactly 100 characters and an empty description', async () => {
    const response = await request(app.getHttpServer())
      .post('/books')
      .send({ categoryId: 2, title: 'a'.repeat(100), description: '' })
      .expect(201);

    expect(response.body.title).toBe('a'.repeat(100));
    expect(response.body.description).toBe('');
  });

  it('returns 404 for an unknown category without creating or saving a book', async () => {
    categoryRepository.findOneBy.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/books')
      .send({ categoryId: 999, title: 'Missing Category' })
      .expect(404);

    expect(categoryRepository.findOneBy).toHaveBeenCalledExactlyOnceWith({
      categoryId: '999',
    });
    expect(bookRepository.create).not.toHaveBeenCalled();
    expect(bookRepository.save).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', { title: 'Book' }],
    ['null', { categoryId: null, title: 'Book' }],
    ['empty string', { categoryId: '', title: 'Book' }],
    ['whitespace', { categoryId: '  ', title: 'Book' }],
    ['fractional', { categoryId: 1.5, title: 'Book' }],
    ['numeric string', { categoryId: '2', title: 'Book' }],
    ['boolean', { categoryId: true, title: 'Book' }],
    ['unsafe integer', { categoryId: 9007199254740992, title: 'Book' }],
    ['zero', { categoryId: 0, title: 'Book' }],
    ['negative', { categoryId: -1, title: 'Book' }],
  ])(
    'rejects a %s categoryId with 400 before any repository write',
    async (_, body) => {
      await request(app.getHttpServer()).post('/books').send(body).expect(400);
      expect(categoryRepository.findOneBy).not.toHaveBeenCalled();
      expect(bookRepository.create).not.toHaveBeenCalled();
      expect(bookRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing', { categoryId: 2 }],
    ['null', { categoryId: 2, title: null }],
    ['empty', { categoryId: 2, title: '' }],
    ['whitespace only', { categoryId: 2, title: ' \t\n ' }],
    ['more than 100 characters', { categoryId: 2, title: 'a'.repeat(101) }],
    ['number', { categoryId: 2, title: 123 }],
    ['array', { categoryId: 2, title: ['Book'] }],
  ])(
    'rejects a %s title with 400 before any repository write',
    async (_, body) => {
      await request(app.getHttpServer()).post('/books').send(body).expect(400);
      expect(categoryRepository.findOneBy).not.toHaveBeenCalled();
      expect(bookRepository.create).not.toHaveBeenCalled();
      expect(bookRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each([null, 42, false, [], {}])(
    'rejects a non-string description %j with 400',
    async (description) => {
      await request(app.getHttpServer())
        .post('/books')
        .send({ categoryId: 2, title: 'Book', description })
        .expect(400);
      expect(categoryRepository.findOneBy).not.toHaveBeenCalled();
      expect(bookRepository.save).not.toHaveBeenCalled();
    },
  );
});
