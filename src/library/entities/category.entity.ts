import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Book } from './book.entity.js';

@Entity('category')
export class Category {
  @PrimaryGeneratedColumn({ name: 'category_id', type: 'bigint' })
  categoryId!: string;

  @Column({ name: 'name', type: 'varchar', length: 50, nullable: false })
  name!: string;

  @OneToMany(() => Book, (book) => book.category)
  books!: Relation<Book[]>;
}
