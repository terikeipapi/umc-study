import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { LibraryService } from './library.service.js';

function positiveId(value: unknown, name: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw new BadRequestException(`${name} must be a positive 32-bit integer`);
  }
  return value;
}

@Controller()
export class LibraryController {
  constructor(
    @Inject(LibraryService) private readonly library: LibraryService,
  ) {}

  @Get('books/category/:categoryId')
  getBooks(@Param('categoryId') categoryId: string) {
    if (!/^\d+$/.test(categoryId)) {
      throw new BadRequestException('categoryId must be a positive integer');
    }
    return this.library.getBooksByCategory(
      positiveId(Number(categoryId), 'categoryId'),
    );
  }

  @Post('rentals')
  createRental(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('A JSON object is required');
    }
    const input = body as Record<string, unknown>;
    const bookId = positiveId(input.bookId, 'bookId');
    const userId = positiveId(input.userId, 'userId');
    return this.library.createRental(bookId, userId);
  }
}
