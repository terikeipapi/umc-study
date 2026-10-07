import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool } from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.pool = createPool({
      host: config.get<string>('DB_HOST', 'localhost'),
      port: Number(config.get<string>('DB_PORT', '3306')),
      user: config.get<string>('DB_USER', 'root'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'library'),
      timezone: 'Z',
      connectionLimit: 10,
    });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
