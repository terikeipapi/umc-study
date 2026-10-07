import type { Book } from '../../library/entities/book.entity.js';

export class BookResponseDto {
  bookId!: string;
  title!: string;
  description!: string | null;
  categoryName!: string;
  isAvailable!: boolean;

  static from(book: Book): BookResponseDto {
    const response = new BookResponseDto();
    response.bookId = String(book.bookId);
    response.title = book.title;
    response.description = book.description;
    response.categoryName = book.category.name;
    response.isAvailable = book.isAvailable;
    return response;
  }
}
