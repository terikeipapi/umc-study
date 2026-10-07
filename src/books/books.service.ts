import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Book } from '../library/entities/book.entity.js';
import { Category } from '../library/entities/category.entity.js';
import { BookResponseDto } from './dto/book-response.dto.js';
import type { CreateBookDto } from './dto/create-book.dto.js';

@Injectable()
export class BooksService {
  constructor(
    @InjectRepository(Book) private readonly books: Repository<Book>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async findAll(): Promise<BookResponseDto[]> {
    const books = await this.books.find({
      relations: { category: true },
      order: { bookId: 'DESC' },
    });
    return books.map((book) => BookResponseDto.from(book));
  }

  async create(input: CreateBookDto): Promise<BookResponseDto> {
    const category = await this.categories.findOneBy({
      categoryId: String(input.categoryId),
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const book = this.books.create({
      category,
      title: input.title,
      description: input.description ?? null,
      isAvailable: true,
    });
    const savedBook = await this.books.save(book);
    return BookResponseDto.from(savedBook);
  }
}
