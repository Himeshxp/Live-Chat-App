# Requirements Document

## Introduction

This feature upgrades the live-chat Spring Boot 4.x application with production-grade security: Spring Security 6, stateless JWT-based authentication, BCrypt password hashing, and full endpoint protection. The existing WebSocket chat functionality and all chat-related code remain untouched. Only the authentication and authorization layer is added or replaced.

---

## Glossary

- **System**: The live-chat Spring Boot application backend.
- **AuthController**: The REST controller handling `/api/auth/register` and `/api/auth/login` endpoints.
- **SecurityConfig**: The Spring Security configuration class that defines the security filter chain.
- **JwtService**: The service responsible for generating, signing, and validating JWT tokens.
- **JwtAuthFilter**: The `OncePerRequestFilter` that intercepts every HTTP request, extracts and validates the JWT, and sets the `SecurityContext`.
- **UserDetailsServiceImpl**: The `UserDetailsService` implementation that loads a `User` by username/email for Spring Security.
- **PasswordEncoder**: The `BCryptPasswordEncoder` bean used to hash and verify passwords.
- **JWT**: JSON Web Token — a compact, self-contained token signed with HMAC-SHA256.
- **SecurityContext**: Spring Security's per-request holder of the authenticated principal.
- **PublicEndpoint**: An endpoint that does not require authentication (`/api/auth/register`, `/api/auth/login`).
- **ProtectedEndpoint**: Any endpoint that requires a valid JWT to access.
- **WebSocket**: The `/ws` STOMP endpoint used for real-time chat — not subject to HTTP security filter changes.
- **AuthRequest**: A DTO carrying `email` and `password` for login.
- **RegisterRequest**: A DTO carrying `username`, `email`, and `password` for registration.
- **AuthResponse**: A DTO carrying the issued `token` (JWT) and user info (`username`, `publicId`).

---

## Requirements

### Requirement 1: Dependency Setup

**User Story:** As a developer, I want the correct Maven dependencies added, so that Spring Security and JWT libraries are available at compile time.

#### Acceptance Criteria

1. THE System SHALL include `spring-boot-starter-security` as a compile-scoped Maven dependency.
2. THE System SHALL include `jjwt-api`, `jjwt-impl`, and `jjwt-jackson` at version `0.12.x` as Maven dependencies, with `jjwt-impl` and `jjwt-jackson` in `runtime` scope.
3. THE System SHALL NOT introduce any deprecated or abandoned JWT library (e.g., `io.jsonwebtoken` < 0.12, `com.auth0:java-jwt` is acceptable as alternative but SHALL NOT be mixed with jjwt).

---

### Requirement 2: BCrypt Password Hashing on Registration

**User Story:** As a security-conscious developer, I want passwords stored as BCrypt hashes, so that plaintext passwords are never persisted to the database.

#### Acceptance Criteria

1. WHEN a registration request is received, THE AuthController SHALL delegate to an `AuthService` which hashes the plaintext password using the `PasswordEncoder` bean before persisting the `User` entity.
2. THE System SHALL NOT store plaintext passwords in the `users` table under any code path.
3. WHEN a `User` entity is saved during registration, THE System SHALL populate the `publicId` field with a unique 8-character alphanumeric identifier if one is not already present.
4. WHEN registration succeeds, THE AuthController SHALL return HTTP 201 with an `AuthResponse` body containing the issued JWT and the user's `username` and `publicId`.
5. IF a registration request is received with an `email` that already exists in the database, THEN THE AuthController SHALL return HTTP 409 with a descriptive error message.

---

### Requirement 3: Login Endpoint Returns JWT

**User Story:** As a client application, I want to exchange credentials for a JWT, so that I can authenticate subsequent requests without re-sending credentials.

#### Acceptance Criteria

1. WHEN a login request is received with valid `email` and `password`, THE AuthController SHALL verify the password against the stored BCrypt hash using the `PasswordEncoder` and return HTTP 200 with an `AuthResponse` containing the JWT, `username`, and `publicId`.
2. IF a login request is received with an `email` that does not exist, THEN THE AuthController SHALL return HTTP 401 with a descriptive error message.
3. IF a login request is received with a password that does not match the stored BCrypt hash, THEN THE AuthController SHALL return HTTP 401 with a descriptive error message.
4. THE AuthController SHALL accept the login payload as a JSON request body (not query parameters) containing `email` and `password`.

---

### Requirement 4: JWT Generation and Validation

**User Story:** As a developer, I want a dedicated JWT utility service, so that token creation and validation logic is centralised and reusable.

#### Acceptance Criteria

1. WHEN issued, THE JwtService SHALL generate a JWT signed with HMAC-SHA256 using a secret key read from the environment variable `JWT_SECRET`.
2. WHEN issued, THE JwtService SHALL embed the user's `email` as the JWT subject and set an expiration duration read from the environment variable `JWT_EXPIRATION_MS` (milliseconds).
3. WHEN validating a token, THE JwtService SHALL return the subject (email) only if the signature is valid and the token has not expired.
4. IF a token has an invalid signature or has expired, THEN THE JwtService SHALL throw a runtime exception that the JwtAuthFilter will handle by clearing the SecurityContext and returning HTTP 401.
5. THE JwtService SHALL use only non-deprecated JJWT 0.12.x APIs (i.e., `Jwts.builder()`, `Jwts.parserBuilder()` is replaced by `Jwts.parser()` in 0.12).

---

### Requirement 5: JWT Authentication Filter

**User Story:** As a developer, I want a filter that validates the JWT on every request, so that protected endpoints are inaccessible without a valid token.

#### Acceptance Criteria

1. THE JwtAuthFilter SHALL extend `OncePerRequestFilter` to guarantee single execution per HTTP request.
2. WHEN a request carries an `Authorization` header with a value starting with `Bearer `, THE JwtAuthFilter SHALL extract the token, validate it via JwtService, load the corresponding `UserDetails` via UserDetailsServiceImpl, and set the authentication in the SecurityContext.
3. WHEN a request does not carry an `Authorization` header or the header does not start with `Bearer `, THE JwtAuthFilter SHALL pass the request to the next filter without modifying the SecurityContext.
4. IF token validation fails for any reason, THEN THE JwtAuthFilter SHALL clear the SecurityContext and allow the request to continue to the filter chain, resulting in a 401 response from the security configuration.
5. THE JwtAuthFilter SHALL be registered in the security filter chain before `UsernamePasswordAuthenticationFilter`.

---

### Requirement 6: Spring Security Configuration

**User Story:** As a developer, I want a SecurityConfig class using modern Spring Security 6 APIs, so that HTTP security rules, CSRF settings, and session management are explicitly defined without deprecated code.

#### Acceptance Criteria

1. THE SecurityConfig SHALL disable CSRF protection because the API is stateless and token-based.
2. THE SecurityConfig SHALL configure session management as `STATELESS` so no server-side HTTP session is created.
3. THE SecurityConfig SHALL permit unauthenticated access to `/api/auth/register`, `/api/auth/login`, and `/ws/**` (WebSocket handshake).
4. THE SecurityConfig SHALL require authentication for all other HTTP requests.
5. THE SecurityConfig SHALL add the `JwtAuthFilter` to the filter chain before `UsernamePasswordAuthenticationFilter` using `addFilterBefore`.
6. THE SecurityConfig SHALL expose an `AuthenticationManager` bean for use by `AuthService`.
7. THE SecurityConfig SHALL use `@Bean`-annotated methods and the lambda DSL (`HttpSecurity` consumer lambdas) — no deprecated `WebSecurityConfigurerAdapter` or `antMatchers`.
8. THE SecurityConfig SHALL permit CORS with `corsConfigurationSource` allowing all origins, the `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS` HTTP methods, and the `Authorization` and `Content-Type` headers.

---

### Requirement 7: UserDetailsService Integration

**User Story:** As a developer, I want Spring Security to load users from the database, so that the authentication framework can verify credentials.

#### Acceptance Criteria

1. THE UserDetailsServiceImpl SHALL implement `org.springframework.security.core.userdetails.UserDetailsService`.
2. WHEN `loadUserByUsername` is called with an email address, THE UserDetailsServiceImpl SHALL look up the `User` entity via `UserRepository.findByEmail` and return a `UserDetails` object.
3. IF no `User` is found for the given email, THEN THE UserDetailsServiceImpl SHALL throw `UsernameNotFoundException`.
4. THE UserDetails object returned by UserDetailsServiceImpl SHALL include the user's email as the username, the hashed password, and a single granted authority of `ROLE_USER`.

---

### Requirement 8: Configurable JWT Properties via Environment Variables

**User Story:** As a DevOps engineer, I want JWT secret and expiration configured through environment variables, so that secrets are not hardcoded in source code.

#### Acceptance Criteria

1. THE System SHALL read the JWT signing secret from the environment variable `JWT_SECRET`, bound via `@Value("${jwt.secret}")` in `application.properties` using the pattern `jwt.secret=${JWT_SECRET}`.
2. THE System SHALL read the token expiration in milliseconds from the environment variable `JWT_EXPIRATION_MS`, bound via `@Value("${jwt.expiration.ms}")` in `application.properties` using the pattern `jwt.expiration.ms=${JWT_EXPIRATION_MS:86400000}` (default 24 hours).
3. THE System SHALL fail to start with a descriptive error if `JWT_SECRET` is not set and no default is provided.

---

### Requirement 9: Clean Architecture and Package Structure

**User Story:** As a developer maintaining the codebase, I want new security classes placed in a dedicated `security` package, so that concerns are clearly separated and the project structure is navigable.

#### Acceptance Criteria

1. THE System SHALL place `SecurityConfig`, `JwtAuthFilter`, `JwtService`, and `UserDetailsServiceImpl` under the package `com.project.livechat.security`.
2. THE System SHALL place `AuthController` and `AuthService` under the package `com.project.livechat.auth` (renaming/moving the existing `Auth` package to `auth` for consistency).
3. THE System SHALL place request/response DTOs (`AuthRequest`, `RegisterRequest`, `AuthResponse`) under `com.project.livechat.auth`.
4. THE System SHALL NOT modify any class in the `com.project.livechat.chat` or `com.project.livechat.config` packages, except to ensure WebSocket endpoints remain accessible without authentication.

---

### Requirement 10: Preservation of Existing Chat Functionality

**User Story:** As an end user, I want real-time chat to continue working after the security upgrade, so that the new authentication layer does not break existing features.

#### Acceptance Criteria

1. THE SecurityConfig SHALL permit unauthenticated WebSocket upgrade requests to `/ws/**` so that SockJS and STOMP connections are not blocked.
2. THE System SHALL NOT alter any method signatures, field definitions, or annotations in `ChatController`, `ChatService`, `ChatMessage`, `ChatRepo`, `ConversationService`, `ConversationController`, or any class in the `chat` or `config` packages.
3. WHEN the application starts, THE System SHALL successfully register all existing WebSocket message mappings (`/app/chat.sendMessage`, `/app/chat.addUser`) alongside the new security configuration.
