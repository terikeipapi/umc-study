# 도서 조회 및 대여 API

기존 스키마가 없어 MySQL 8.0+ 기준으로 정의했습니다. 도서 한 행은 대여 가능한 실물 도서 한 권이며, 회원 인증은 이번 구현 범위에 포함하지 않습니다.

## 실행

1. `.env.example`을 참고해 `.env`의 DB 연결 정보를 설정합니다.
2. `DB_NAME`에 지정한 데이터베이스를 생성하고 해당 DB에서 `sql/schema.sql`을 실행합니다. 앱은 테이블을 자동 생성하지 않습니다.
3. categories, users, books에 테스트 데이터를 추가합니다.
4. `npm run start:dev`로 실행합니다.

예시 데이터 (비어 있는 테이블 기준):

```sql
INSERT INTO categories (id, name) VALUES (1, '소설');
INSERT INTO users (id, name) VALUES (1, '홍길동');
INSERT INTO books (id, title, author, category_id) VALUES (1, '테스트 도서', '작가', 1);
```

## GET /books/category/{categoryId}

성공 시 200과 도서 배열을 반환합니다. 도서는 ID 오름차순입니다.

```json
[{ "id": 1, "title": "테스트 도서", "author": "작가", "categoryId": 1 }]
```

카테고리는 있으나 도서가 없으면 `[]`, 카테고리가 없으면 404, 잘못된 ID는 400입니다.

## POST /rentals

`Content-Type: application/json`으로 요청합니다.

```json
{ "bookId": 1, "userId": 1 }
```

성공 시 201과 생성된 기록을 반환합니다.

```json
{ "id": 1, "bookId": 1, "userId": 1, "rentedAt": "2026-09-30T10:00:00", "dueAt": "2026-10-07T10:00:00", "returnedAt": null }
```

ID는 1~2147483647 사이 정수이며, 요청 본문에서는 숫자 타입이어야 합니다. `rental` 테이블에 다음 SQL로 삽입하며, 바인딩 값은 `[userId, bookId]`입니다.

```sql
INSERT INTO rental (user_id, book_id, rented_at, due_at)
VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY));
```

대여 시각과 7일 뒤 반납 기한은 DB 세션 시간대를 기준으로 생성하고, 저장된 값을 다시 조회해 반환합니다. 응답 시각 문자열은 시간대 접미사가 없는 DB 현지 시각입니다. 잘못된 입력은 400, 도서 또는 회원이 없으면 404, 미반납 대여가 있으면 409입니다. 트랜잭션의 도서 행 잠금과 DB 고유 제약으로 동일 도서의 중복 대여를 방지합니다.

이전 기본 스키마를 이미 생성했다면 `members` → `users`, `rentals` → `rental`, `member_id` → `user_id` 변경 및 `due_at` 컬럼 추가가 필요합니다. 현재 `sql/schema.sql`은 새 DB용입니다.

## 검증

`npm run build`, `npm test`, `npm run test:e2e`, `npm run lint`를 실행합니다. API 테스트는 DB를 모킹하므로 실제 MySQL 연결 및 동시성 검증은 별도로 필요합니다.
