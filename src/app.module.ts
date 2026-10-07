import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BooksModule } from './books/books.module.js';
import { DatabaseService } from './database/database.service.js';
import { LibraryController } from './library/library.controller.js';
import { LibraryService } from './library/library.service.js';

@Module({
  imports: [
    // 환경 변수를 애플리케이션 전역에서 사용 가능하도록 설정
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '3306')),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.getOrThrow<string>('DB_NAME'),
        timezone: 'Z',
        supportBigNumbers: true,
        bigNumberStrings: true,
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        dropSchema: false,
      }),
    }),
    BooksModule,
  ],
  controllers: [AppController, LibraryController],
  providers: [AppService, DatabaseService, LibraryService],
})
export class AppModule {}
