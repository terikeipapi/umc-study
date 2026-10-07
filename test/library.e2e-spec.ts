import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';

describe('Library API (mock database)', () => {
  let app: INestApplication;
  const execute = vi.fn();
  const connection = {
    execute,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = { execute, getConnection: vi.fn(async () => connection) };

  beforeEach(async () => {
    vi.resetAllMocks();
    pool.getConnection.mockResolvedValue(connection);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken())
      .useValue({
        entityMetadatas: [],
        options: { type: 'mysql' },
        getRepository: vi.fn(() => ({})),
        manager: {},
        isInitialized: false,
      })
      .overrideProvider(DatabaseService)
      .useValue({ pool })
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

  it('returns books for a category using a bound parameter', async () => {
    const books = [{ id: 1, title: 'Book', author: 'Author', categoryId: 2 }];
    execute.mockResolvedValueOnce([[{ id: 2 }]]).mockResolvedValueOnce([books]);
    await request(app.getHttpServer())
      .get('/books/category/2')
      .expect(200, books);
    expect(execute.mock.calls[1][1]).toEqual([2]);
    expect(execute.mock.calls[1][0]).toContain('WHERE category_id = ?');
  });

  it('returns an empty list for a category without books', async () => {
    execute.mockResolvedValueOnce([[{ id: 2 }]]).mockResolvedValueOnce([[]]);
    await request(app.getHttpServer()).get('/books/category/2').expect(200, []);
  });

  it('returns 404 for a missing category', async () => {
    execute.mockResolvedValueOnce([[]]);
    await request(app.getHttpServer()).get('/books/category/2').expect(404);
  });

  it.each(['0', '-1', 'abc', '1.5', '2147483648', '1%20OR%201=1'])(
    'rejects invalid category %s',
    async (id) => {
      await request(app.getHttpServer())
        .get(`/books/category/${id}`)
        .expect(400);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { bookId: 1 },
    { bookId: 1, memberId: 2 },
    { bookId: '1', userId: 1 },
    { bookId: -1, userId: 1 },
    { bookId: 1, userId: 1.5 },
    { bookId: 1, userId: null },
  ])('rejects invalid rental body %j', async (body) => {
    await request(app.getHttpServer()).post('/rentals').send(body).expect(400);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('creates a rental using database time and a seven-day due date', async () => {
    const rental = {
      id: 3,
      bookId: 1,
      userId: 2,
      rentedAt: '2026-09-30T10:00:00',
      dueAt: '2026-10-07T10:00:00',
      returnedAt: null,
    };
    execute
      .mockResolvedValueOnce([[{ id: 1 }]])
      .mockResolvedValueOnce([[{ id: 2 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([[rental]]);
    const response = await request(app.getHttpServer())
      .post('/rentals')
      .send({ bookId: 1, userId: 2 })
      .expect(201);
    expect(response.body).toEqual(rental);
    expect(execute).toHaveBeenNthCalledWith(
      4,
      'INSERT INTO rental (user_id, book_id, rented_at, due_at) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [2, 1],
    );
    expect(execute.mock.calls[4][1]).toEqual([3]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it.each(['book', 'member', 'active', 'insert'])(
    'rolls back and releases on %s failure',
    async (stage) => {
      execute.mockResolvedValueOnce([stage === 'book' ? [] : [{ id: 1 }]]);
      if (stage !== 'book')
        execute.mockResolvedValueOnce([stage === 'member' ? [] : [{ id: 2 }]]);
      if (stage === 'active' || stage === 'insert')
        execute.mockResolvedValueOnce([stage === 'active' ? [{ id: 3 }] : []]);
      if (stage === 'insert')
        execute.mockRejectedValueOnce(new Error('Database failure'));
      app.useLogger(false);
      await request(app.getHttpServer())
        .post('/rentals')
        .send({ bookId: 1, userId: 2 })
        .expect(stage === 'active' ? 409 : stage === 'insert' ? 500 : 404);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledOnce();
      expect(connection.release).toHaveBeenCalledOnce();
    },
  );
});
