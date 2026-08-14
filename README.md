# Aura Live Chat

A real-time one-to-one messaging application built with Spring Boot, Spring Security, JWT, WebSocket/STOMP, and PostgreSQL.

Users can register, log in, search other users by public ID, create private conversations, exchange live messages, load persistent chat history, update their profile/avatar color, and see basic online/offline presence.

For a detailed code walkthrough, see [PROJECT_GUIDE.md](PROJECT_GUIDE.md).

## Features

- User registration and login
- JWT-based stateless authentication
- BCrypt password hashing
- Server-side token revocation on logout
- Per-IP login/register rate limiting
- Unique public ID for each user
- User search by public ID
- Private one-to-one conversations
- Persistent message history
- Real-time messaging with WebSocket/STOMP
- WebSocket JWT authentication
- Authorized WebSocket topic subscriptions
- Conversation sidebar updates in real time
- Online/offline presence tracking
- Profile update support for username and avatar color
- Centralized JSON error handling
- Static frontend served by the Spring Boot app

## Tech Stack

### Backend

- Java 17
- Spring Boot
- Spring MVC
- Spring Security
- Spring Data JPA / Hibernate
- Spring WebSocket / STOMP
- PostgreSQL
- JJWT
- Bucket4j
- Caffeine
- Maven
- Lombok

### Frontend

- HTML
- CSS
- Vanilla JavaScript
- Native WebSocket

## Project Structure

```text
src
+-- main
    +-- java
    |   +-- com.project.livechat
    |       +-- Auth
    |       |   +-- AuthController.java
    |       |   +-- AuthService.java
    |       |   +-- RateLimiterService.java
    |       |   +-- GlobalExceptionHandler.java
    |       +-- chat
    |       |   +-- ChatController.java
    |       |   +-- ChatRestController.java
    |       |   +-- ChatService.java
    |       |   +-- ChatRepo.java
    |       |   +-- ChatMessage.java
    |       +-- config
    |       |   +-- WebSocketconfigurer.java
    |       |   +-- WebSocketAuthInterceptor.java
    |       |   +-- WebSocketEventListener.java
    |       +-- entity
    |       |   +-- User.java
    |       |   +-- UserController.java
    |       |   +-- UserService.java
    |       |   +-- UserRepository.java
    |       |   +-- conversation
    |       +-- security
    |       |   +-- SecurityConfig.java
    |       |   +-- JwtService.java
    |       |   +-- JwtAuthFilter.java
    |       |   +-- TokenBlocklist.java
    |       |   +-- UserDetailsServiceImpl.java
    |       +-- status
    |       |   +-- PresenceController.java
    |       |   +-- PresenceService.java
    |       +-- LiveChatApplication.java
    +-- resources
        +-- application.properties
        +-- static
            +-- index.html
            +-- frontend
                +-- index.html
                +-- app.js
                +-- styles.css
                +-- assests
```

## Core Workflows

### Authentication

Registration and login are handled through `/api/auth/register` and `/api/auth/login`.

On successful login/register:

1. The backend validates the request DTO.
2. Login/register rate limiting is checked.
3. Passwords are hashed or verified using BCrypt.
4. `JwtService` creates a signed JWT using the user's email as the subject.
5. The frontend stores the token in `sessionStorage`.
6. Later REST requests send the token as `Authorization: Bearer <token>`.

Protected REST requests pass through `JwtAuthFilter`, which validates the token, checks logout revocation, loads the user, and sets the authenticated principal.

### Conversations And Messages

Users start a conversation by searching another user's public ID.

The backend uses the authenticated JWT principal as the current user, not a user value from the request body. `ConversationService` checks whether a conversation already exists between both users and returns the existing one or creates a new one.

Message history is loaded over REST:

```text
GET /api/chat/conversations/{conversationId}/messages
```

Live messages are sent over WebSocket/STOMP:

```text
SEND /app/chat.sendMessage
SUBSCRIBE /topic/chat/{conversationId}
```

Before reading, sending, or subscribing to a conversation, the backend verifies that the authenticated user is one of the conversation participants.

### Presence

Online/offline status is based on active WebSocket sessions.

When a user connects, `WebSocketEventListener` marks them online through `PresenceService`. When all of their sessions disconnect, they are marked offline and `lastSeen` is updated.

Presence updates are broadcast to:

```text
/topic/presence
```

## API Summary

### Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
```

### Users

```text
GET   /api/users/me
PATCH /api/users/me
GET   /api/users/public/{publicId}
```

### Conversations

```text
GET  /api/conversations
POST /api/conversations
```

### Chat

```text
GET /api/chat/conversations/{conversationId}/messages
```

### Presence

```text
GET /api/presence/{publicId}
```

## WebSocket Destinations

Client sends to:

```text
/app/chat.sendMessage
/app/chat.addUser
```

Client subscribes to:

```text
/topic/chat/{conversationId}
/topic/users/{publicId}/conversations
/topic/presence
```

## Getting Started

### 1. Clone The Repository

```bash
git clone https://github.com/Himeshxp/Live-Chat-App.git
cd Live-Chat-App
```

### 2. Configure Environment Variables

The app reads database, JWT, CORS, and port settings from environment variables.

Required:

```text
DB_URL=jdbc:postgresql://localhost:5432/chatapp
DB_USERNAME=your_database_username
DB_PASSWORD=your_database_password
JWT_SECRET=at-least-32-characters-long-secret-value
```

Optional:

```text
JWT_EXPIRATION_MS=86400000
DDL_AUTO=update
ALLOWED_ORIGINS=*
PORT=8080
```

For a stronger JWT secret, generate one with:

```bash
openssl rand -base64 32
```

### 3. Run The App

```bash
mvn spring-boot:run
```

Visit:

```text
http://localhost:8080
```

## Useful Notes

- `PROJECT_GUIDE.md` contains the detailed walkthrough of login, JWT, WebSocket auth, conversations, message sending, presence, and class connections.
- `CreateConversationRequestDTO` still contains a legacy `currentUser` field, but the secure flow uses the JWT principal instead.
- Token revocation and presence are currently stored in memory, which is fine for a single-server deployment but should move to a shared store such as Redis for multi-instance deployments.
- `ddl-auto=update` is convenient during development; production deployments should use migrations with Flyway or Liquibase.

## Future Improvements

- Group chats
- Read receipts
- Typing indicators
- File sharing
- Refresh token flow
- Redis-backed token blocklist and presence
- Database migrations with Flyway or Liquibase
- External message broker for larger WebSocket deployments

