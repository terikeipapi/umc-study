import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { BooksService } from './books.service.js';
import type { BookResponseDto } from './dto/book-response.dto.js';
import { CreateBookDto } from './dto/create-book.dto.js';

@Controller('books')
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  @Get()
  findAll(): Promise<BookResponseDto[]> {
    return this.books.findAll();
  }

  @Post()
  create(@Body() input: CreateBookDto): Promise<BookResponseDto> {
    return this.books.create(input);
  }
}
