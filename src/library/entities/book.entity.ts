import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Category } from './category.entity.js';

@Entity('book')
export class Book {
  @PrimaryGeneratedColumn({ name: 'book_id', type: 'bigint' })
  bookId!: string;

  @Column({ name: 'title', type: 'varchar', length: 100, nullable: false })
  title!: string;

  @Column({
    name: 'description',
    type: 'text',
    nullable: true,
    default: null,
  })
  description!: string | null;

  @Column({
    name: 'is_available',
    type: 'boolean',
    nullable: false,
    default: true,
  })
  isAvailable!: boolean;

  @ManyToOne(() => Category, (category) => category.books, { nullable: false })
  @JoinColumn({ name: 'category_id' })
  category!: Relation<Category>;
}
