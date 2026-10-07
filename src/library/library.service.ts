import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class LibraryService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getBooksByCategory(categoryId: number) {
    const [categories] = await this.db.pool.execute<RowDataPacket[]>(
      'SELECT id FROM categories WHERE id = ?',
      [categoryId],
    );
    if (!categories.length) throw new NotFoundException('Category not found');
    const [books] = await this.db.pool.execute<RowDataPacket[]>(
      'SELECT id, title, author, category_id AS categoryId FROM books WHERE category_id = ? ORDER BY id',
      [categoryId],
    );
    return books;
  }

  async createRental(bookId: number, userId: number) {
    const connection = await this.db.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Serialize rental requests for the same physical book.
      const [books] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM books WHERE id = ? FOR UPDATE',
        [bookId],
      );
      if (!books.length) throw new NotFoundException('Book not found');
      const [users] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM users WHERE id = ? FOR SHARE',
        [userId],
      );
      if (!users.length) throw new NotFoundException('User not found');
      const [active] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM rental WHERE book_id = ? AND returned_at IS NULL FOR UPDATE',
        [bookId],
      );
      if (active.length) throw new ConflictException('Book is already rented');
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO rental (user_id, book_id, rented_at, due_at) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))',
        [userId, bookId],
      );
      const [rentals] = await connection.execute<RowDataPacket[]>(
        `SELECT id, user_id AS userId, book_id AS bookId,
                DATE_FORMAT(rented_at, '%Y-%m-%dT%H:%i:%s') AS rentedAt,
                DATE_FORMAT(due_at, '%Y-%m-%dT%H:%i:%s') AS dueAt,
                returned_at AS returnedAt
         FROM rental WHERE id = ?`,
        [result.insertId],
      );
      await connection.commit();
      return rentals[0];
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Book is already rented');
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}
