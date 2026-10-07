# NestJS + TypeORM 과제 제출 자료

검증일: 2026-10-07. 프로젝트는 `study`입니다. 기존 Entity·DTO·Module·Service·Controller 구현을 재사용했고, 이번에는 실DB 검증 결과를 출력하는 스크립트와 제출 문서를 보완했습니다.

## 실제 스키마와 구현

개발 DB의 `information_schema.COLUMNS`와 FK 정보를 직접 조회했습니다. 접속 비밀번호와 .env의 실제 설정 값은 문서에 포함하지 않았습니다.

| 실제 테이블·컬럼       | 코드 필드             | 타입·제약                                           |
| ---------------------- | --------------------- | --------------------------------------------------- |
| `book.book_id`         | `Book.bookId`         | BIGINT, AUTO_INCREMENT PK, NOT NULL; 문자열 ID      |
| `book.category_id`     | `Book.category`       | BIGINT, NOT NULL; `category.category_id` 참조 FK    |
| `book.title`           | `Book.title`          | VARCHAR(100), NOT NULL, 기본값 없음                 |
| `book.description`     | `Book.description`    | TEXT, NULL 허용; `string \| null`                   |
| `book.is_available`    | `Book.isAvailable`    | TINYINT(1), NOT NULL, 기본값 1; boolean·기본값 true |
| `category.category_id` | `Category.categoryId` | BIGINT, AUTO_INCREMENT PK, NOT NULL; 문자열 ID      |
| `category.name`        | `Category.name`       | VARCHAR(50), NOT NULL, 기본값 없음                  |

`@Entity('book')`·`@Entity('category')`와 컬럼의 `name`으로 snake_case를 명시적으로 매핑합니다. `Book.category`는 `ManyToOne`·`JoinColumn({ name: 'category_id' })`으로 FK를 소유하고, `Category.books`는 `OneToMany` 역방향입니다. 별도 categoryId 컬럼을 중복 선언하지 않았습니다.

기존 `sql/schema.sql`은 3주차 복수형 `books/categories/users` 및 `rental` 예제이며 실제 단수형 `book/category`와 다릅니다. 현재 DB에 실행하지 않습니다. 기존 파일·API를 유지했으며 테이블 생성·변경·삭제를 수행하지 않았습니다.

## 핵심 코드와 캡처 위치

모든 경로는 `study/` 기준입니다. 시작 줄을 열고 아래 코드가 함께 보이도록 IDE에서 캡처합니다.

| 구분                    | 파일·시작 줄                                               | 캡처할 부분                                                                                              |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Book Entity             | `src/library/entities/book.entity.ts:11`                   | Entity·PK·컬럼·ManyToOne·JoinColumn                                                                      |
| Category Entity         | `src/library/entities/category.entity.ts:5`                | Entity·PK·name·OneToMany                                                                                 |
| ORM 연결                | `src/app.module.ts:18`                                     | forRootAsync, ConfigService 주입, 환경변수 키, autoLoadEntities true·synchronize false, BooksModule 연결 |
| Repository 등록         | `src/books/books.module.ts:8`                              | forFeature([Book, Category]), Service·Controller 등록                                                    |
| 요청 DTO                | `src/books/dto/create-book.dto.ts:13`                      | 필수 정수, 제목 공백·길이, 선택 설명 검증                                                                |
| 전역 검증               | `src/main.ts:5`                                            | ValidationPipe의 transform true·whitelist true                                                           |
| 응답 DTO                | `src/books/dto/book-response.dto.ts:3`                     | 다섯 필드와 BookResponseDto.from()                                                                       |
| Repository 주입·Service | `src/books/books.service.ts:10`                            | InjectRepository, findAll()의 관계·내림차순, create()의 Category 확인·404·create/save                    |
| Controller              | `src/books/books.controller.ts:6`                          | Controller, Get·Post, Body CreateBookDto                                                                 |
| 3주차 SELECT            | `src/library/library.service.ts:14`                        | 직접 작성한 SQL, execute와 파라미터 바인딩                                                               |
| 3주차 INSERT            | `src/library/library.service.ts:27`                        | 대여 등록 트랜잭션과 FK 숫자·INSERT                                                                      |
| 3주차 수동 검증         | `src/library/library.controller.ts:40`                     | unknown 본문 검사·positiveId()                                                                           |
| 자동 검증               | `test/books.e2e-spec.ts`, `test/books.db-verification.mjs` | 테스트 코드와 터미널 결과                                                                                |

필요한 `@nestjs/typeorm`, `typeorm`, `mysql2`, `class-validator`, `class-transformer`는 설치되어 있습니다. ORM은 ConfigService로 기존 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 키를 읽으며 포트 기본값은 3306입니다. Repository 등록과 전역 Pipe는 각각 한 번이며 `autoLoadEntities: true`, `synchronize: false`, `migrationsRun: false`, `dropSchema: false`입니다.

## 실행과 실제 Postman 주소

실행 중인 서버의 **http://localhost:3000/books**에서 GET 200, 공백 제목 POST 400, 없는 Category POST 404를 실제 HTTP 요청으로 확인했습니다. 이 주소는 확인된 API 접속 주소이며 DB 연결 정보가 아닙니다.

서버가 실행 중이면 그대로 사용합니다. 서버가 중지되어 있다면 PowerShell에서 실행합니다.

```powershell
cd C:\umc\study
npm.cmd run build
npm.cmd run start:dev
```

Postman 환경변수 `baseUrl`을 `http://localhost:3000`으로 설정합니다. POST는 `{{baseUrl}}/books`, `Content-Type: application/json`, `Body → raw → JSON`을 사용합니다.

실제 Category **1 = 문학**, **2 = 과학**을 조회해 확인했습니다. 아래 정상 요청은 존재하는 ID 1을 사용합니다. 카테고리가 바뀌었다면 먼저 다음 읽기 전용 SQL로 확인합니다.

```sql
SELECT category_id, name FROM category ORDER BY category_id;
```

categoryId는 양의 안전한 JSON 정수만 허용하며 숫자 문자열·null·빈 문자열·공백·소수는 거부합니다. title은 필수 문자열·최대 100자이며 빈 값과 공백만 있는 값은 거부합니다. description은 선택 문자열로 생략 시 null이며 명시적 null과 문자열 이외 값은 거부합니다. 숫자의 암시적 변환은 하지 않고, 추가 필드는 whitelist로 제거합니다. 응답은 `bookId, title, description, categoryName, isAvailable`만 포함하며 bookId는 문자열입니다.

## Postman 캡처 순서

URL·메서드, 요청 JSON, 응답 상태와 Body가 보이도록 캡처합니다. 직접 생성하는 도서는 `[ORM-assignment-capture]` 제목 접두어로 구분합니다. 기존 데이터를 삭제하지 않으며 직접 만든 캡처용 행도 자동 삭제하지 않습니다.

### 1. GET 성공 — 200 OK

`GET {{baseUrl}}/books`를 실행합니다. 지정된 다섯 필드와 categoryName, 숫자로 비교한 bookId 내림차순, isAvailable=false인 도서 포함 여부를 캡처합니다. 모든 도서를 조회하므로 행 수 제한이나 대여 가능 조건이 없습니다.

실제 3000 포트 서버에서 확인한 결과입니다. 이후 도서를 추가하면 결과의 ID와 행 수는 달라질 수 있습니다.

```json
[
  {
    "bookId": "3",
    "title": "우주를 읽는 법",
    "description": "과학 교양",
    "categoryName": "과학",
    "isAvailable": true
  },
  {
    "bookId": "2",
    "title": "겨울의 편지",
    "description": "에세이",
    "categoryName": "문학",
    "isAvailable": false
  },
  {
    "bookId": "1",
    "title": "달빛 도서관",
    "description": "소설",
    "categoryName": "문학",
    "isAvailable": true
  }
]
```

### 2. POST 정상 등록 — 201 Created

```json
{
  "categoryId": 1,
  "title": "[ORM-assignment-capture] New book",
  "description": "Assignment capture with description"
}
```

201과 다섯 응답 필드를 캡처합니다. categoryName은 "문학", isAvailable은 true입니다. 반환된 bookId를 `createdBookId`로 기록하고 아래 SQL에서 사용합니다. ID를 미리 고정하지 않습니다.

### 3. POST 설명 생략 — 201과 null

```json
{
  "categoryId": 1,
  "title": "[ORM-assignment-capture] Without description"
}
```

description을 제거한 JSON을 전송한 뒤 201과 `description: null`을 캡처합니다. 이 응답의 bookId도 별도로 기록하여 DB의 SQL NULL을 확인합니다.

### 4. POST 잘못된 요청 — 400 Bad Request

```json
{
  "categoryId": 1,
  "title": "   "
}
```

실제 서버에서 확인한 응답입니다.

```json
{
  "message": ["title must contain a non-whitespace character"],
  "error": "Bad Request",
  "statusCode": 400
}
```

추가로 categoryId 누락·null·빈 문자열·소수와 title 누락·빈 문자열·101자 입력도 400인지 확인할 수 있습니다.

### 5. POST 없는 Category — 404 Not Found

검증 당시 존재하지 않음을 확인한 ID를 사용합니다.

```json
{
  "categoryId": 9007199254740991,
  "title": "[ORM-assignment-capture] Missing category"
}
```

실제 서버에서 확인한 응답입니다.

```json
{
  "message": "Category not found",
  "error": "Not Found",
  "statusCode": 404
}
```

이 요청은 카테고리 조회에서 404로 종료하고 도서를 저장하지 않습니다. 아래 제목 조회가 요청 전·후 모두 0인지 확인합니다.

### 6. 생성된 bookId로 SQL 저장 확인

DB 클라이언트에서 현재 개발 DB를 선택합니다. `'<createdBookId>'`를 2번 요청에서 반환한 실제 ID로 바꿔 실행하고 결과를 캡처합니다. 추가된 행의 카테고리 FK, 제목, 설명, 기본 상태를 확인합니다.

```sql
SELECT b.book_id AS bookId, b.title, b.description,
       c.name AS categoryName, b.is_available AS isAvailable,
       b.category_id AS categoryId
FROM book b
JOIN category c ON c.category_id = b.category_id
WHERE b.book_id = '<createdBookId>';
```

3번 요청의 실제 반환 ID로 설명 생략 시 DB 저장값을 확인합니다.

```sql
SELECT book_id, description, description IS NULL AS descriptionIsNull,
       is_available, category_id
FROM book
WHERE book_id = '<bookId returned by the omitted-description request>';
```

404 요청의 미저장 확인과 직접 생성한 캡처용 행 구분은 다음 읽기 전용 SQL을 사용합니다.

```sql
SELECT COUNT(*) AS savedCount
FROM book
WHERE title = '[ORM-assignment-capture] Missing category';

SELECT book_id, category_id, title, description, is_available
FROM book
WHERE title LIKE '[ORM-assignment-capture]%'
ORDER BY book_id DESC;
```

## 실행한 검증과 실제 결과

```powershell
npm.cmd run build
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
npm.cmd test
npm.cmd run test:e2e
node test/books.db-verification.mjs --run
```

| 검증                                                     | 실제 결과                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Nest 빌드·전체 TypeScript 검사                           | 통과                                                                                                             |
| 단위 테스트                                              | 1개 통과                                                                                                         |
| 기존 API·새 API e2e, 실제 ValidationPipe·mock Repository | 51개 통과                                                                                                        |
| 실행 중인 3000 포트 서버                                 | GET 200·필드·관계·내림차순, 공백 제목 400, 없는 Category 404 확인                                                |
| 실제 MySQL·트랜잭션 Repository·별도 Nest HTTP 테스트 앱  | 전체 조회·내림차순·Category 이름·대여 불가 포함, 정상 POST 201·SQL 저장, 설명 생략 SQL NULL, 400/404 미저장 확인 |
| 실제 DB 잘못된 입력                                      | 12종 모두 400·행 수 증가 없음                                                                                    |
| 데이터 보존                                              | 테스트 신규 2건 롤백, 기존 도서 3건·Category 2건 및 테이블 구조 유지                                             |

정상 POST는 실제 MySQL Repository를 사용한 별도 HTTP 테스트 앱의 트랜잭션 안에서 검증했습니다. 실행 중인 3000 포트 서버에 성공 INSERT를 추가로 보내지는 않았습니다. 다음은 자동 검증의 실제 201 응답입니다.

```json
{
  "bookId": "6",
  "title": "Books API verification 5845b0bd-3d44-4888-9f99-f3bd672441ef with description",
  "description": "Temporary integration verification",
  "categoryName": "문학",
  "isAvailable": true
}
```

설명 생략 요청의 실제 201 응답입니다.

```json
{
  "bookId": "7",
  "title": "Books API verification 5845b0bd-3d44-4888-9f99-f3bd672441ef without description",
  "description": null,
  "categoryName": "문학",
  "isAvailable": true
}
```

생성 ID로 SQL을 조회해 확인한 트랜잭션 내 저장 값입니다.

```json
[
  {
    "bookId": "6",
    "categoryId": "1",
    "description": "Temporary integration verification",
    "isAvailable": true
  },
  {
    "bookId": "7",
    "categoryId": "1",
    "description": null,
    "isAvailable": true
  }
]
```

자동 검증의 테스트 제목 접두어는 `Books API verification 5845b0bd-3d44-4888-9f99-f3bd672441ef`입니다. 위 ID 6, 7는 모두 롤백했으므로 현재 DB에서 조회하면 행이 나오지 않습니다. 직접 캡처할 때는 Postman으로 생성한 새 ID를 사용합니다. MySQL AUTO_INCREMENT 번호는 롤백 후에도 소모될 수 있습니다.

Postman GUI 캡처는 아직 수행하지 않았습니다. 위 1~6번 요청과 SQL, IDE 핵심 코드, 빌드·테스트 터미널 결과를 직접 캡처하면 됩니다. 기존 분류 조회·대여 API는 유지했지만 복수형 Raw SQL의 단수형 실제 DB 호환 문제는 이번 검증 대상이 아닙니다. 기존 API 회귀 테스트 결과는 mock 검증에 한정합니다.

## 3주차 Raw SQL과 이번 ORM 비교

기존 3주차 코드는 `src/library/library.service.ts`의 `getBooksByCategory()`에서 SELECT 문을 직접 작성하고, mysql2의 `pool.execute()`에 `?`와 `[categoryId]`를 전달해 값을 바인딩합니다. 기존 코드의 INSERT는 신규 도서 등록이 아니라 `createRental()`의 대여 등록이며, `user_id`와 `book_id`를 직접 지정하고 트랜잭션 및 예외 처리를 구현합니다. 이번 도서 API는 `Repository.find()`로 전체 도서를 조회하고, `Category Repository.findOneBy()`로 카테고리를 확인한 뒤 `Book Repository.create()`와 `save()`로 저장합니다.

기존 SQL에서는 `category_id`를 정수 FK 값으로 다루고 조회 결과에 `AS categoryId` 별칭을 붙였지만, 이번 코드는 `Book.category`에 Category 엔티티를 연결하며 `@JoinColumn({ name: 'category_id' })`이 실제 FK 컬럼을 매핑합니다. 기존 Controller는 unknown 요청 본문과 ID를 수동으로 검사하고 Service가 SQL 조회 행을 반환하지만, 이번 POST는 CreateBookDto와 전역 ValidationPipe로 입력을 검증하며 GET·POST 응답은 BookResponseDto.from()으로 지정한 다섯 필드만 반환합니다. ORM에서도 categoryName을 사용하려면 관계 로딩을 지정해야 하고 정렬·입력 검증·없는 Category의 404 처리를 명시적으로 구현해야 하므로 ORM 사용만으로 이 문제들이 자동 해결되지는 않습니다.

## 요구사항과 실행 결과 일치 여부

실제 개발 DB에서 전체 도서의 다섯 필드·카테고리명·bookId 내림차순, 정상 등록 201·설명 생략 시 SQL NULL, 잘못된 입력 400·없는 Category 404와 미저장, 기존 데이터 보존을 확인하여 이번 과제 API 요구사항과 실행 결과가 일치합니다.
