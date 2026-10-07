import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book } from '../library/entities/book.entity.js';
import { Category } from '../library/entities/category.entity.js';
import { BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Book, Category])],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}
