# Live Chat Project Walkthrough

This guide is not a theory guide. It is a walkthrough of how this exact project runs.

The goal is that if an interviewer asks:

- "Explain login."
- "Explain JWT in your project."
- "How does a message go from one user to another?"
- "How are your classes connected?"
- "Why did you implement it like this?"

you can answer by tracing the real code path.

## 1. The Big Runtime Picture

At runtime, the project has three main flows:

```text
1. Auth flow
   register/login/logout

2. REST app flow
   profile, user search, conversations, message history, presence lookup

3. WebSocket flow
   real-time messages, conversation updates, online/offline presence events
```

The frontend is plain JavaScript in:

```text
src/main/resources/static/frontend/app.js
```

The backend is Spring Boot. The most important packages are:

```text
Auth
    AuthController
    AuthService
    AuthRequest
    RegisterRequest
    AuthResponse
    RateLimiterService
    GlobalExceptionHandler

security
    SecurityConfig
    JwtService
    JwtAuthFilter
    UserDetailsServiceImpl
    TokenBlocklist
    JsonAuthEntryPoint

entity
    User
    UserController
    UserService
    UserRepository

entity.conversation
    Conversation
    ConversationController
    ConversationService
    ConversationRepository

chat
    ChatMessage
    ChatController
    ChatRestController
    ChatService
    ChatRepo

config
    WebSocketconfigurer
    WebSocketAuthInterceptor
    WebSocketEventListener

status
    PresenceService
    PresenceController
```

The key idea behind the backend is:

```text
Controller receives request
Service decides business logic
Repository talks to database
DTO controls what comes in or goes out
Security layer decides who is allowed in
```

But the important interview part is not naming these layers. The important part is explaining the execution path.

## 2. App Startup Walkthrough

The app starts from:

```text
LiveChatApplication.main()
```

That calls:

```java
SpringApplication.run(LiveChatApplication.class, args)
```

After this, Spring scans the project and creates beans for classes like:

```text
AuthController
AuthService
JwtService
JwtAuthFilter
SecurityConfig
ConversationService
ChatController
WebSocketAuthInterceptor
```

Important startup detail:

`JwtService.init()` runs because it has `@PostConstruct`.

That method prepares the JWT signing key before the app starts serving requests.

Actual order inside `JwtService.init()`:

```text
1. Read jwt.secret from application.properties.
2. Try to decode it as Base64URL.
3. If decoding works and gives at least 32 bytes, use decoded bytes.
4. Otherwise treat JWT_SECRET as a plain UTF-8 string.
5. If final key is shorter than 32 bytes, throw IllegalStateException.
6. Build cachedKey using Keys.hmacShaKeyFor(keyBytes).
```

Why this matters:

If `JWT_SECRET` is weak or missing, the app should fail fast during startup instead of issuing insecure tokens.

## 3. Security Setup Walkthrough

Security rules are configured in:

```text
security/SecurityConfig.java
```

The important method is:

```java
securityFilterChain(HttpSecurity http)
```

This sets:

```text
CSRF disabled
CORS enabled
SessionCreationPolicy.STATELESS
JSON auth error response
Public routes
Protected routes
JwtAuthFilter before UsernamePasswordAuthenticationFilter
```

The route rules are:

```text
Allowed without JWT:
    POST /api/auth/register
    POST /api/auth/login
    /ws/**
    /frontend/**
    /
    /index.html

Everything else:
    JWT required
```

Important:

`/ws/**` is allowed at HTTP security level because the real WebSocket authentication happens later inside `WebSocketAuthInterceptor`, when the STOMP `CONNECT` frame arrives.

So there are two authentication paths:

```text
REST request auth:
    JwtAuthFilter

WebSocket/STOMP auth:
    WebSocketAuthInterceptor
```

Both use:

```text
JwtService
UserDetailsServiceImpl
TokenBlocklist
```

## 4. Registration Walkthrough

Frontend starts in:

```text
app.js -> doAuth()
```

When the selected auth mode is register, this code builds:

```js
{
  username,
  email,
  password
}
```

Then it sends:

```text
POST /api/auth/register
Content-Type: application/json
```

### Backend Execution Order

Request reaches Spring Security first.

Because `/api/auth/register` is permitted in `SecurityConfig`, Spring does not require JWT.

Then Spring MVC handles the controller route:

```java
AuthController.register(@RequestBody @Valid RegisterRequest request, HttpServletRequest httpRequest)
```

Before the method body really runs, Spring does two things:

```text
1. Jackson converts JSON into RegisterRequest.
2. Bean Validation checks annotations on RegisterRequest.
```

`RegisterRequest` checks:

```text
username:
    not blank
    3 to 30 characters
    alphabets only

email:
    not blank
    valid email
    max 254 characters

password:
    not blank
    8 to 128 characters
```

If validation fails:

```text
MethodArgumentNotValidException is thrown
GlobalExceptionHandler.handleValidation() handles it
HTTP 400 is returned
```

If validation passes, `AuthController.register()` continues.

Inside `AuthController.register()`:

```text
1. resolveClientIp(httpRequest)
2. rateLimiterService.tryConsumeRegister(ip)
3. If rate limit exceeded, return 429
4. authService.register(request)
5. Return AuthResponse
```

### `resolveClientIp()`

This method decides which IP address to use for rate limiting.

It uses:

```text
request.getRemoteAddr()
```

It only trusts `X-Forwarded-For` or `X-Real-IP` when the direct connection came from localhost.

Why:

Headers like `X-Forwarded-For` can be spoofed by clients. The method trusts them only if the request came through a trusted local reverse proxy.

### `RateLimiterService.tryConsumeRegister(ip)`

This checks the register bucket for that IP.

Limit:

```text
5 register attempts per 10 minutes per IP
```

If the IP has no bucket yet, Caffeine creates one:

```java
registerCache.get(ip, k -> buildRegisterBucket())
```

Then:

```java
tryConsume(1)
```

If it returns `false`, controller returns:

```text
HTTP 429 Too Many Requests
```

### `AuthService.register(request)`

This is where the user is actually created.

Execution:

```text
1. userRepository.findByEmail(request.email())
2. If email exists, throw DuplicateEmailException
3. Create new User object
4. user.setUsername(request.username())
5. user.setEmail(request.email())
6. user.setPassword(passwordEncoder.encode(request.password()))
7. user.setPublicId(generateUniquePublicId())
8. userRepository.save(user)
9. jwtService.generateToken(user.getEmail())
10. Return new AuthResponse(token, username, publicId, avatarColor)
```

### Duplicate Email

If the email already exists:

```java
throw new DuplicateEmailException("Email already registered: " + request.email())
```

Handled by:

```text
GlobalExceptionHandler.handleDuplicateEmail()
```

Returned response:

```text
HTTP 409 Conflict
```

### Password Hashing

The password is hashed here:

```java
passwordEncoder.encode(request.password())
```

`passwordEncoder` is defined in `SecurityConfig`:

```java
return new BCryptPasswordEncoder();
```

So the database stores the BCrypt hash, not the raw password.

### Public ID Generation

`generateUniquePublicId()` does:

```text
1. Generate UUID.
2. Remove dashes.
3. Take first 8 characters.
4. Convert to uppercase.
5. Check userRepository.existsByPublicId(id).
6. Retry if already used.
```

Why:

The public ID is what users share to start chats. It avoids exposing emails.

### JWT Creation During Register

After saving the user:

```java
String token = jwtService.generateToken(user.getEmail());
```

Then the response is:

```java
new AuthResponse(token, user.getUsername(), user.getPublicId(), user.getAvatarColor())
```

The frontend receives this and logs the user in immediately.

### Frontend After Register Success

Back in `app.js -> doAuth()`:

```text
1. readJson(res)
2. Check data.token and data.username
3. saveSession(data.token, data.username, data.publicId, data.avatarColor)
4. applyMe(...)
5. showApp()
6. loadConversations()
7. connect()
```

`saveSession()` stores:

```text
sessionStorage:
    aura.token
    aura.username
    aura.publicId
    aura.avatarColor
```

Then it removes old auth values from localStorage.

## 5. Login Walkthrough

Frontend starts in:

```text
app.js -> doAuth()
```

For login mode, it sends:

```text
POST /api/auth/login
```

Body:

```json
{
  "email": "...",
  "password": "..."
}
```

### Backend Execution Order

Security allows `/api/auth/login` without JWT.

Spring converts JSON into:

```text
AuthRequest
```

Validation checks:

```text
email:
    not blank
    valid email
    max 254 characters

password:
    not blank
    8 to 128 characters
```

If validation fails:

```text
GlobalExceptionHandler.handleValidation()
HTTP 400
```

If valid, controller method runs:

```java
AuthController.login(AuthRequest request, HttpServletRequest httpRequest)
```

Inside `AuthController.login()`:

```text
1. resolveClientIp(httpRequest)
2. rateLimiterService.tryConsumeLogin(ip)
3. If too many attempts, return 429
4. authService.login(request)
5. Return AuthResponse
```

Login rate limit:

```text
10 login attempts per 10 minutes per IP
```

### `AuthService.login(request)`

This is the actual login logic.

Execution:

```text
1. userRepository.findByEmail(request.email())
2. If not found, throw BadCredentialsException
3. passwordEncoder.matches(request.password(), user.getPassword())
4. If false, throw BadCredentialsException
5. jwtService.generateToken(user.getEmail())
6. Return AuthResponse(token, username, publicId, avatarColor)
```

Important:

Both missing email and wrong password throw the same error:

```text
Invalid email or password
```

Why:

So attackers cannot test which emails are registered.

### Password Check

This line:

```java
passwordEncoder.matches(request.password(), user.getPassword())
```

compares:

```text
raw password from request
against
BCrypt hash stored in database
```

It does not decrypt the database password. BCrypt recalculates/checks the hash safely.

### JWT Creation During Login

If password matches:

```java
jwtService.generateToken(user.getEmail())
```

The email becomes the token subject.

The returned `AuthResponse` goes back to frontend.

### Frontend After Login Success

`app.js -> doAuth()` does:

```text
1. saveSession(token, username, publicId, avatarColor)
2. applyMe(username, publicId, avatarColor)
3. showApp()
4. await loadConversations()
5. connect()
```

At this point:

- REST requests can use `authFetch()`.
- WebSocket connection can authenticate using the JWT.

## 6. `JwtService.generateToken()` Walkthrough

This method is used by both:

```text
AuthService.register()
AuthService.login()
```

Actual method:

```java
public String generateToken(String email) {
    return Jwts.builder()
            .subject(email)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expirationMs))
            .signWith(cachedKey)
            .compact();
}
```

Step by step:

```text
1. Jwts.builder()
   Starts building the token.

2. subject(email)
   Stores the user's email as the token subject.
   Later, this becomes principal.getName().

3. issuedAt(new Date())
   Stores when the token was created.

4. expiration(now + expirationMs)
   Stores when the token expires.
   Default is 24 hours unless JWT_EXPIRATION_MS changes it.

5. signWith(cachedKey)
   Signs the token using the server secret.

6. compact()
   Converts it into the final JWT string.
```

Why email is used:

The app treats email as the stable login identity. The token subject is later used to load the user from the database.

## 7. What Happens On A Protected REST Request

Example:

```text
GET /api/conversations
Authorization: Bearer <token>
```

Frontend uses:

```js
authFetch(url, opts)
```

That function adds:

```js
Authorization: `Bearer ${getToken()}`
```

### Backend Execution Order

Before `ConversationController` runs, the request passes through:

```text
JwtAuthFilter.doFilterInternal()
```

This filter runs once per request.

Inside `JwtAuthFilter`:

```text
1. Read Authorization header.
2. If missing or not starting with "Bearer ", continue without authentication.
3. Extract token by removing "Bearer ".
4. Check tokenBlocklist.isRevoked(token).
5. If revoked, continue without authentication.
6. jwtService.extractEmail(token).
7. userDetailsService.loadUserByUsername(email).
8. jwtService.isTokenValid(token, userDetails).
9. If valid, create UsernamePasswordAuthenticationToken.
10. Put auth object into SecurityContextHolder.
11. Continue filter chain.
```

Important detail:

If the token is missing or invalid, the filter itself usually does not directly return the error. It simply does not authenticate the request. Later, because the route requires authentication, Spring Security calls `JsonAuthEntryPoint`.

That returns:

```json
{"error":"Unauthorized. Please log in."}
```

with:

```text
HTTP 401
```

### `jwtService.extractEmail(token)`

This calls:

```java
extractAllClaims(token).getSubject()
```

`extractAllClaims()` does:

```java
Jwts.parser()
    .verifyWith(cachedKey)
    .build()
    .parseSignedClaims(token)
    .getPayload()
```

Meaning:

```text
1. Use same cached secret key.
2. Verify token signature.
3. Parse token claims.
4. Return payload claims.
```

If someone changed the token, parsing fails.

If the token is malformed, parsing fails.

The filter catches exceptions:

```java
catch (Exception e) {
    SecurityContextHolder.clearContext();
}
```

Then the request continues unauthenticated and protected endpoints return 401.

### `UserDetailsServiceImpl.loadUserByUsername(email)`

Despite the method name saying username, this project passes email.

Execution:

```text
1. userRepository.findByEmail(email)
2. If found, create Spring Security UserDetails
3. Give it username = user.email
4. Give it password = user.password hash
5. Give it authority ROLE_USER
6. Return UserDetails
```

Returned object:

```java
new User(
    user.getEmail(),
    user.getPassword(),
    List.of(new SimpleGrantedAuthority("ROLE_USER"))
)
```

Why:

Spring Security works with `UserDetails`. This adapter converts your own `User` entity into Spring Security's expected user object.

### `jwtService.isTokenValid(token, userDetails)`

Execution:

```text
1. extractEmail(token)
2. Compare email from token with userDetails.getUsername()
3. Check token is not expired
4. Return true or false
```

Actual method:

```java
return email.equals(userDetails.getUsername()) && !isTokenExpired(token);
```

If true, the filter creates authentication:

```java
UsernamePasswordAuthenticationToken authToken =
    new UsernamePasswordAuthenticationToken(
        userDetails,
        null,
        userDetails.getAuthorities()
    );
```

Then:

```java
SecurityContextHolder.getContext().setAuthentication(authToken);
```

This is the line that officially marks the request as logged in.

After this, controller methods can receive:

```java
Principal principal
```

and:

```java
principal.getName()
```

returns the authenticated email.

## 8. What "Session Is Valid" Means In This Project

This project does not use server-side HTTP sessions for login.

So there is no method that says "this session is valid."

Instead, every request is checked like this:

```text
Does request have Bearer token?
Is token revoked?
Can token signature be verified?
Is token expired?
Does token subject match a real user?
```

If yes:

```text
JwtAuthFilter puts Authentication into SecurityContextHolder.
Spring allows the request.
```

If no:

```text
No Authentication is set.
Spring blocks protected endpoint.
JsonAuthEntryPoint returns 401 JSON.
```

That is the JWT version of "session valid."

## 9. Error Handling Walkthrough

Most controller/service errors end up in:

```text
GlobalExceptionHandler
```

Examples:

### Invalid DTO

If `@Valid` fails:

```text
MethodArgumentNotValidException
    -> GlobalExceptionHandler.handleValidation()
    -> HTTP 400
```

Response shape:

```json
{
  "error": "Validation failed",
  "fields": {
    "email": "Must be a valid email address"
  }
}
```

### Duplicate Email

```text
DuplicateEmailException
    -> handleDuplicateEmail()
    -> HTTP 409
```

### Wrong Login

```text
BadCredentialsException
    -> handleAuthFailure()
    -> HTTP 401
```

The response is always:

```json
{"error":"Invalid email or password"}
```

### Unauthenticated Protected Request

This is handled by:

```text
JsonAuthEntryPoint
```

not `GlobalExceptionHandler`.

Example:

```text
GET /api/conversations without JWT
```

Response:

```json
{"error":"Unauthorized. Please log in."}
```

## 10. Loading Conversations After Login

After login/register success, frontend calls:

```text
app.js -> loadConversations()
```

That sends:

```text
GET /api/conversations
Authorization: Bearer <token>
```

### Backend Execution Order

First:

```text
JwtAuthFilter authenticates request
```

Then:

```java
ConversationController.getConversations(Principal principal)
```

Inside:

```java
return conversationService.getConversationsForUser(principal.getName());
```

Here:

```text
principal.getName() = email from JWT
```

### `ConversationService.getConversationsForUser(currentUser)`

Execution:

```text
1. resolveUser(currentUser)
2. conversationRepository.findAllForUser(user.getId())
3. Convert each Conversation to ConversationResponseDTO
4. Return list
```

### `resolveUser(value)`

This method tries:

```text
1. findByUsername(value)
2. findByEmail(value)
3. findByPublicId(value)
```

In this flow, `value` is the email from JWT, so `findByEmail()` is the one that succeeds.

### `ConversationRepository.findAllForUser(userId)`

Query:

```java
select c from Conversation c
where c.participant1.id = :userId or c.participant2.id = :userId
order by c.createdAt desc
```

It uses:

```java
@EntityGraph(attributePaths = {"participant1", "participant2"})
```

Why:

The response needs participant usernames, public IDs, and avatar colors. EntityGraph fetches those users together with the conversations to avoid lazy-loading surprises and extra queries.

### `ConversationService.toResponse(conversation)`

Converts entity to DTO:

```text
conversation id
participant1 username/publicId/avatarColor
participant2 username/publicId/avatarColor
createdAt
```

Frontend stores the returned list in:

```js
conversations = await readJson(res)
```

Then renders sidebar:

```js
renderConvList()
```

## 11. Connecting WebSocket After Login

After loading conversations, frontend calls:

```text
app.js -> connect()
```

It opens:

```js
socket = new WebSocket(WS)
```

Where `WS` is:

```text
ws://host/ws/websocket
```

When socket opens, frontend sends a STOMP `CONNECT` frame:

```js
stompFrame("CONNECT", {
  "accept-version": "1.2",
  host: new URL(API).host,
  Authorization: `Bearer ${getToken()}`
});
```

### Backend WebSocket Config

Configured in:

```text
WebSocketconfigurer
```

`registerStompEndpoints()` registers:

```text
/ws
```

with SockJS support.

`configureMessageBroker()` sets:

```text
Application destination prefix: /app
Simple broker prefix: /topic
```

Meaning:

```text
Client SEND to /app/chat.sendMessage
    -> goes to @MessageMapping("/chat.sendMessage")

Server sends to /topic/chat/{id}
    -> clients subscribed to that topic receive it
```

### WebSocket Authentication

Every inbound STOMP frame passes through:

```text
WebSocketAuthInterceptor.preSend()
```

For `CONNECT`, it calls:

```text
authenticateConnect(accessor)
```

Inside `authenticateConnect()`:

```text
1. Read native STOMP header "Authorization".
2. If missing or not Bearer, throw IllegalArgumentException.
3. Extract token.
4. tokenBlocklist.isRevoked(token).
5. jwtService.extractEmail(token).
6. userDetailsService.loadUserByUsername(email).
7. jwtService.isTokenValid(token, userDetails).
8. Create UsernamePasswordAuthenticationToken.
9. accessor.setUser(auth).
```

This line is the WebSocket equivalent of setting the logged-in user:

```java
accessor.setUser(auth);
```

If token is invalid:

```text
IllegalArgumentException is thrown
STOMP sends ERROR frame
Connection closes/rejects
```

### Frontend On Successful WebSocket Connect

When frontend receives STOMP `CONNECTED`:

```text
handleFrame()
```

It does:

```text
1. connected = true
2. startHB()
3. stompSend("/app/chat.addUser", ...)
4. subConvUpdates()
5. subPresence()
6. if active conversation exists, subActive()
7. enable composer if active
8. show Online toast
```

`startHB()` sends a heartbeat newline every 10 seconds.

## 12. WebSocket Presence Flow

When a WebSocket session connects, Spring publishes:

```text
SessionConnectedEvent
```

Handled by:

```text
WebSocketEventListener.handleWebSocketConnectListener()
```

Execution:

```text
1. Wrap event message with StompHeaderAccessor.
2. Get accessor.getUser().
3. If user is Authentication, get email using authentication.getName().
4. Get WebSocket sessionId.
5. presenceService.markOnline(email, sessionId).
6. If user changed from offline to online, publish presence event.
```

### `PresenceService.markOnline(email, sessionId)`

Execution:

```text
1. Get or create Set<String> sessions for this email.
2. Check if set was empty.
3. Add sessionId.
4. Return true only if user was previously offline.
```

Why:

If a user opens two tabs, there are two WebSocket sessions. Closing one tab should not mark the user offline if another tab is still connected.

### Presence Broadcast

If user changed to online, `publishPresence(email, true)` runs:

```text
1. Load User by email.
2. Build PresenceEventDTO(publicId, online, lastSeen).
3. Send to /topic/presence.
```

Frontend receives this if subscribed to:

```text
/topic/presence
```

Then it updates:

```text
presenceByPublicId map
sidebar online dots
active chat status
```

### Disconnect

On disconnect:

```text
SessionDisconnectEvent
    -> handleWebSocketDisconnectListener()
    -> presenceService.markOffline(email, sessionId)
```

`markOffline()`:

```text
1. Remove this sessionId from the user's session set.
2. If no sessions remain:
   - remove user from online map
   - save lastSeen timestamp
   - return true
3. Otherwise return false
```

If it returns true, server broadcasts offline presence.

## 13. Starting A Conversation

Frontend flow starts when user enters public ID in the sidebar search form.

```text
app.js -> userSearchForm submit listener
```

Execution:

```text
1. Read public ID input.
2. Convert it to uppercase.
3. If it equals my publicId, show "That is your own ID."
4. GET /api/users/public/{id}
5. If user exists, POST /api/conversations with otherPublicId.
6. Upsert returned conversation in sidebar.
7. selectConversation(conv)
```

### User Search Request

Frontend calls:

```text
GET /api/users/public/{publicId}
Authorization: Bearer <token>
```

Backend:

```text
JwtAuthFilter authenticates
UserController.getUserByPublicId(publicId)
UserService.findByPublicId(publicId)
UserRepository.findByPublicId(publicId)
Return UserResponseDTO
```

If not found:

```text
UserService throws IllegalArgumentException
GlobalExceptionHandler.handleIllegalArgument()
HTTP 400
```

Note:

This could arguably be 404, but currently `UserService.findByPublicId()` throws `IllegalArgumentException`, so the handler returns 400.

### Create Conversation Request

Frontend calls:

```text
POST /api/conversations
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "otherPublicId": "ABCD1234"
}
```

`CreateConversationRequestDTO` validates:

```text
otherPublicId:
    not blank
    uppercase letters/digits
    8 to 10 chars according to regex
```

Important:

The DTO still contains `currentUser`, but the secure code does not use it.

### Backend Create Conversation Execution

Controller:

```java
ConversationController.getOrCreateConversation(request, principal)
```

Inside:

```java
conversationService.getOrCreateConversation(
    principal.getName(),
    request.otherPublicId()
)
```

Why `principal.getName()`:

The current user must come from the verified JWT, not from the request body.

### `ConversationService.getOrCreateConversation(currentUser, otherPublicId)`

Execution:

```text
1. participant1 = resolveUser(currentUser)
2. participant2 = userRepository.findByPublicId(otherPublicId)
3. If participant2 missing, throw EntityNotFoundException
4. If participant1.id equals participant2.id, throw IllegalArgumentException
5. conversationRepository.findBetweenUsers(participant1.id, participant2.id)
6. If found, use existing conversation
7. If not found, save new Conversation(participant1, participant2)
8. Convert to ConversationResponseDTO
9. Return DTO
```

### Existing Conversation Check

Repository query:

```java
where (c.participant1.id = :userA and c.participant2.id = :userB)
   or (c.participant1.id = :userB and c.participant2.id = :userA)
```

Why:

Conversation between user 1 and user 2 should be the same regardless of who started it.

### After Conversation Is Created

`ConversationController` broadcasts the conversation DTO to both users:

```java
messagingTemplate.convertAndSend(
    "/topic/users/" + conversation.participant1PublicId() + "/conversations",
    conversation
);

messagingTemplate.convertAndSend(
    "/topic/users/" + conversation.participant2PublicId() + "/conversations",
    conversation
);
```

Why:

If the other user is online, their sidebar can update immediately.

## 14. Selecting A Conversation

Frontend method:

```text
app.js -> selectConversation(conv)
```

Execution:

```text
1. active = conv
2. Determine other participant with otherParticipant(conv)
3. loadPresence(other.publicId)
4. renderActivePresence()
5. Update chat header UI
6. unsubActive()
7. subPresence()
8. clearMessages()
9. Disable composer temporarily
10. loadMessages(conv.id)
11. subActive()
12. Enable composer if WebSocket connected
```

The important backend request here is:

```text
GET /api/chat/conversations/{conversationId}/messages
```

## 15. Loading Message History

Frontend:

```text
app.js -> loadMessages(id)
```

Backend route:

```java
ChatRestController.getMessagesForConversation(conversationId, principal)
```

Execution:

```text
1. JwtAuthFilter authenticates REST request.
2. Controller gets Principal.
3. Controller calls chatService.getMessagesForConversation(conversationId, principal.getName()).
```

### `ChatService.getMessagesForConversation(conversationId, currentUser)`

Execution:

```text
1. conversationService.getConversationForMessage(conversationId, currentUser)
2. If this passes, user is allowed to read messages.
3. repo.findByConversationIdOrderByTimestampAsc(conversationId)
4. Convert each ChatMessage to ChatMessageResponseDTO
5. Return list
```

### Permission Check

`ConversationService.getConversationForMessage(conversationId, sender)`:

```text
1. conversationRepository.findWithParticipantsById(conversationId)
2. If not found, throw EntityNotFoundException
3. resolveUser(sender)
4. Check if user.id equals participant1.id or participant2.id
5. If not participant, throw IllegalArgumentException
6. Return Conversation
```

This is important:

The app does not just trust the conversation ID. It verifies that the logged-in user belongs to that conversation before returning messages.

### Message Query

`ChatRepo.findByConversationIdOrderByTimestampAsc(conversationId)` returns messages oldest first.

It uses:

```java
@EntityGraph(attributePaths = "sender")
```

Why:

The response needs sender username and sender public ID. EntityGraph loads sender with each message.

### Response Conversion

`ChatService.toResponse(message)` returns:

```text
sender username
sender publicId
content
type
timestamp
conversationId
```

Frontend receives the array and calls:

```js
h.forEach((m) => appendMessage(m))
```

## 16. Subscribing To Live Chat Messages

After message history loads, frontend calls:

```text
subActive()
```

It sends STOMP:

```text
SUBSCRIBE
destination:/topic/chat/{active.id}
```

### Backend Subscription Authorization

Every `SUBSCRIBE` frame goes through:

```text
WebSocketAuthInterceptor.preSend()
```

For subscriptions, it calls:

```text
authorizeSubscription(accessor)
```

If destination starts with:

```text
/topic/chat/
```

then:

```text
1. Parse conversation ID from destination.
2. conversationService.getConversationForMessage(conversationId, email)
3. If user is participant, allow subscription.
4. Otherwise throw IllegalArgumentException.
```

Why:

Without this, a user could guess `/topic/chat/10` and listen to someone else's messages.

## 17. Sending A Message

Frontend method:

```text
app.js -> doSend()
```

Execution:

```text
1. Read textarea value.
2. Trim it.
3. If empty, not connected, or no active conversation, stop.
4. Send STOMP message to /app/chat.sendMessage.
5. Clear textarea.
```

Payload:

```json
{
  "sender": "username",
  "content": "hello",
  "type": "CHAT",
  "conversationId": 1
}
```

Important:

The frontend still sends `sender`, but the backend ignores it for identity.

### Backend Message Execution

Destination:

```text
/app/chat.sendMessage
```

Because the app prefix is `/app`, Spring routes this to:

```java
ChatController.sendMessage()
```

because it has:

```java
@MessageMapping("/chat.sendMessage")
```

Method:

```java
sendMessage(@Payload @Valid ChatMessageRequestDTO message, Principal principal)
```

Before method logic, validation checks `ChatMessageRequestDTO`:

```text
content:
    not blank
    max 2000 chars

conversationId:
    not null
```

### `ChatController.sendMessage()`

Execution:

```text
1. If principal is null, throw IllegalArgumentException.
2. senderEmail = principal.getName().
3. userRepository.findByEmail(senderEmail).
4. conversationService.getConversationForMessage(message.conversationId(), senderEmail).
5. Build ChatMessage entity.
6. chatService.saveChatMessage(chatMessage).
7. Broadcast message DTO to /topic/chat/{conversationId}.
8. Convert conversation to ConversationResponseDTO.
9. Broadcast conversation update to both users' conversation sidebar topics.
```

### Why Principal Is Used

This is a security fix:

```text
The client can lie in message.sender.
The client cannot fake principal unless it has a valid JWT.
```

So the actual sender is loaded from:

```java
principal.getName()
```

not:

```java
message.sender()
```

### Message Entity Creation

Backend builds:

```java
ChatMessage.builder()
    .sender(sender)
    .content(message.content())
    .type(message.type() == null ? MessageType.CHAT : message.type())
    .conversation(conversation)
    .build()
```

Then:

```java
chatService.saveChatMessage(chatMessage)
```

### `ChatService.saveChatMessage()`

Execution:

```text
1. If timestamp is null, set Instant.now().
2. repo.save(message).
3. Return saved ChatMessage.
```

There is also JPA auditing on `ChatMessage.timestamp` through:

```text
JpaConfig -> @EnableJpaAuditing
ChatMessage -> @CreatedDate
```

The manual timestamp fallback makes sure a timestamp exists even if auditing does not set it.

### Broadcast To Chat Topic

After saving:

```java
messagingTemplate.convertAndSend(
    "/topic/chat/" + conversation.getId(),
    chatService.toResponse(saved)
);
```

Every client subscribed to that conversation topic receives the message.

Frontend receives STOMP `MESSAGE`, checks destination:

```js
if (active && dest === `/topic/chat/${active.id}`)
```

Then:

```js
appendMessage(msg)
scrollBottom()
```

### Broadcast Sidebar Update

After sending the message, backend also does:

```text
send conversation DTO to participant1's /topic/users/{publicId}/conversations
send conversation DTO to participant2's /topic/users/{publicId}/conversations
```

Frontend has subscribed to:

```text
/topic/users/{me.publicId}/conversations
```

When it receives an update:

```text
handleConvUpdate(conv)
```

That updates or inserts the conversation in the sidebar.

## 18. Logout Walkthrough

Frontend:

```text
leaveBtn click listener
```

Execution:

```text
1. POST /api/auth/logout using authFetch()
2. Ignore errors if logout request fails
3. onDisconnect(true, "")
```

### Backend Logout

Endpoint:

```text
POST /api/auth/logout
Authorization: Bearer <token>
```

Because logout is not in `permitAll`, it first passes through:

```text
JwtAuthFilter
```

So normally the token must be valid for the logout endpoint to run.

Controller:

```java
AuthController.logout(HttpServletRequest httpRequest)
```

Execution:

```text
1. Read Authorization header.
2. If it starts with Bearer, extract token.
3. jwtService.extractExpiration(token).
4. tokenBlocklist.revoke(token, expiration).
5. Return success message.
```

### `TokenBlocklist.revoke(token, expiry)`

Execution:

```text
1. blocked.put(token, expiry)
2. evictExpired()
```

After this, if the same token is used again:

```text
JwtAuthFilter -> tokenBlocklist.isRevoked(token) -> true
```

So the request is not authenticated.

WebSocket auth also checks:

```text
tokenBlocklist.isRevoked(token)
```

So a revoked token cannot create a new WebSocket session either.

### Frontend Local Cleanup

`onDisconnect(true, "")`:

```text
1. Stop heartbeat.
2. Unsubscribe active chat.
3. Unsubscribe conversation updates.
4. Unsubscribe presence.
5. Send STOMP DISCONNECT if socket open.
6. Close socket.
7. clearSession().
8. Reset me/conversations/active state.
9. Show auth screen.
```

## 19. Profile Update Walkthrough

Frontend opens profile modal and saves.

On save:

```text
app.js -> saveProfileBtn click listener
```

It builds a patch object only with changed fields:

```js
if (nu !== me.username) patch.username = nu;
if (pendingColor !== me.avatarColor) patch.avatarColor = pendingColor;
```

Then sends:

```text
PATCH /api/users/me
Authorization: Bearer <token>
Content-Type: application/json
```

Body may be:

```json
{
  "username": "new_name",
  "avatarColor": "#7C5CFF"
}
```

### Backend Execution

```text
JwtAuthFilter authenticates request.
Spring validates UpdateProfileRequest.
UserController.updateProfile(request, principal)
```

Inside:

```java
userService.updateProfile(principal.getName(), request)
```

### `UserService.updateProfile(email, request)`

Execution:

```text
1. repo.findByEmail(email)
2. If username is non-null and not blank, update username.
3. If avatarColor is non-null and not blank, update avatarColor.
4. repo.save(user)
5. Convert to UserResponseDTO
6. Return DTO
```

Why:

The endpoint updates the logged-in user only. It does not accept email or user ID from the frontend.

Frontend then:

```text
1. saveSession(currentToken, updated username, publicId, avatarColor)
2. applyMe(...)
3. close modal
4. render conversation list again
```

## 20. Presence Lookup Walkthrough

When selecting a chat, frontend calls:

```text
loadPresence(other.publicId)
```

That sends:

```text
GET /api/presence/{publicId}
Authorization: Bearer <token>
```

Backend:

```text
JwtAuthFilter authenticates
PresenceController.getPresence(publicId)
UserRepository.findByPublicId(publicId)
presenceService.isOnline(user.getEmail())
presenceService.getLastSeen(user.getEmail())
Return PresenceResponseDTO
```

Frontend stores response:

```js
presenceByPublicId.set(data.publicId, data)
```

Then:

```js
renderActivePresence()
```

sets UI to online/offline.

## 21. Frontend Functions You Should Recognize

You do not need to explain every DOM update. Know these functions:

```text
doAuth()
    Login/register request.

saveSession()
    Stores JWT and profile in sessionStorage.

authFetch()
    Adds Authorization: Bearer token to REST requests.

loadConversations()
    Calls GET /api/conversations.

selectConversation()
    Loads presence, loads history, subscribes to live topic.

loadMessages()
    Calls GET /api/chat/conversations/{id}/messages.

connect()
    Opens WebSocket and sends STOMP CONNECT with JWT.

handleFrame()
    Processes CONNECTED, MESSAGE, and ERROR STOMP frames.

subActive()
    Subscribes to /topic/chat/{conversationId}.

subConvUpdates()
    Subscribes to /topic/users/{myPublicId}/conversations.

subPresence()
    Subscribes to /topic/presence.

doSend()
    Sends message to /app/chat.sendMessage.

onDisconnect()
    Handles logout/disconnect cleanup.
```

## 22. Backend Methods You Should Recognize

Auth:

```text
AuthController.register()
AuthController.login()
AuthController.logout()

AuthService.register()
AuthService.login()

JwtService.init()
JwtService.generateToken()
JwtService.extractEmail()
JwtService.extractExpiration()
JwtService.isTokenValid()

JwtAuthFilter.doFilterInternal()
UserDetailsServiceImpl.loadUserByUsername()
TokenBlocklist.revoke()
TokenBlocklist.isRevoked()
```

Conversation:

```text
ConversationController.getOrCreateConversation()
ConversationController.getConversations()

ConversationService.getOrCreateConversation()
ConversationService.getConversationsForUser()
ConversationService.getConversationForMessage()
ConversationService.resolveUser()
ConversationService.toResponse()
```

Chat:

```text
ChatRestController.getMessagesForConversation()

ChatController.sendMessage()
ChatController.addUser()

ChatService.saveChatMessage()
ChatService.getMessagesForConversation()
ChatService.toResponse()
```

WebSocket:

```text
WebSocketconfigurer.registerStompEndpoints()
WebSocketconfigurer.configureMessageBroker()
WebSocketconfigurer.configureClientInboundChannel()

WebSocketAuthInterceptor.preSend()
WebSocketAuthInterceptor.authenticateConnect()
WebSocketAuthInterceptor.authorizeSubscription()

WebSocketEventListener.handleWebSocketConnectListener()
WebSocketEventListener.handleWebSocketDisconnectListener()
```

Presence:

```text
PresenceService.markOnline()
PresenceService.markOffline()
PresenceService.isOnline()
PresenceService.getLastSeen()

PresenceController.getPresence()
```

## 23. Exact Class Connection Map

### Login/Register

```text
app.js doAuth()
    -> POST /api/auth/login or /api/auth/register
        -> AuthController
            -> RateLimiterService
            -> AuthService
                -> UserRepository
                -> PasswordEncoder
                -> JwtService
            -> AuthResponse
    -> app.js saveSession()
    -> app.js loadConversations()
    -> app.js connect()
```

### Protected REST Request

```text
app.js authFetch()
    -> HTTP request with Authorization header
        -> JwtAuthFilter
            -> TokenBlocklist
            -> JwtService
            -> UserDetailsServiceImpl
                -> UserRepository
        -> SecurityContextHolder stores Authentication
        -> Controller gets Principal
```

### Create Conversation

```text
app.js user search submit
    -> GET /api/users/public/{publicId}
        -> UserController
            -> UserService
                -> UserRepository

    -> POST /api/conversations
        -> JwtAuthFilter
        -> ConversationController
            -> ConversationService
                -> UserRepository
                -> ConversationRepository
            -> SimpMessagingTemplate broadcasts sidebar update
```

### Send Live Message

```text
app.js doSend()
    -> STOMP SEND /app/chat.sendMessage
        -> WebSocketAuthInterceptor already authenticated CONNECT
        -> ChatController.sendMessage()
            -> UserRepository
            -> ConversationService.getConversationForMessage()
                -> ConversationRepository
                -> UserRepository
            -> ChatService.saveChatMessage()
                -> ChatRepo
            -> SimpMessagingTemplate broadcasts:
                -> /topic/chat/{conversationId}
                -> /topic/users/{publicId}/conversations
```

### Presence

```text
WebSocket CONNECT
    -> WebSocketAuthInterceptor.authenticateConnect()
    -> SessionConnectedEvent
        -> WebSocketEventListener
            -> PresenceService.markOnline()
            -> UserRepository
            -> SimpMessagingTemplate /topic/presence

WebSocket DISCONNECT
    -> SessionDisconnectEvent
        -> WebSocketEventListener
            -> PresenceService.markOffline()
            -> UserRepository
            -> SimpMessagingTemplate /topic/presence
```

## 24. Interview Answer: Login

Say it like this:

> When the user submits the login form, `app.js` runs `doAuth()` and sends email and password to `POST /api/auth/login`. Spring converts the JSON into `AuthRequest` and validates the annotations. If validation fails, `GlobalExceptionHandler.handleValidation()` returns a 400. If validation passes, `AuthController.login()` resolves the client IP, checks `RateLimiterService.tryConsumeLogin()`, and then calls `AuthService.login()`.

Continue:

> `AuthService.login()` looks up the user using `UserRepository.findByEmail()`. If the user does not exist, it throws `BadCredentialsException`. If the user exists, it checks the raw password against the stored BCrypt hash using `passwordEncoder.matches()`. If that fails, it throws the same `BadCredentialsException`, so the client cannot know whether the email or password was wrong.

Finish:

> If the password is correct, `AuthService` calls `JwtService.generateToken(user.getEmail())`. That creates a signed JWT with the email as subject, issued-at time, and expiry. The controller returns `AuthResponse` with token, username, public ID, and avatar color. The frontend stores the token in sessionStorage, loads conversations, and opens the WebSocket connection.

## 25. Interview Answer: JWT

Say it like this:

> JWT creation happens in `JwtService.generateToken()`. It sets the subject to the user's email, adds issued-at and expiration timestamps, signs the token with the cached HMAC key, and returns the compact token string. The key is prepared during startup in `JwtService.init()`, where the app reads `JWT_SECRET`, validates that it is at least 32 bytes, and builds the signing key.

Continue:

> For protected REST requests, the frontend uses `authFetch()`, which sends `Authorization: Bearer <token>`. `JwtAuthFilter` reads that header, checks if the token is revoked, extracts the email using `JwtService.extractEmail()`, loads the user through `UserDetailsServiceImpl`, and calls `JwtService.isTokenValid()`. If valid, it creates a `UsernamePasswordAuthenticationToken` and puts it in `SecurityContextHolder`.

Finish:

> After that, controllers can use `Principal principal`, and `principal.getName()` gives the email from the verified JWT. If token validation fails, no authentication is set, and Spring Security returns a JSON 401 through `JsonAuthEntryPoint`.

## 26. Interview Answer: WebSocket Auth

Say it like this:

> REST authentication and WebSocket authentication are separate. REST requests go through `JwtAuthFilter`. WebSocket messages go through `WebSocketAuthInterceptor`. The initial `/ws` handshake is allowed by `SecurityConfig`, but the STOMP `CONNECT` frame must contain `Authorization: Bearer <token>`.

Continue:

> In `WebSocketAuthInterceptor.authenticateConnect()`, the backend extracts the token, checks the blocklist, validates the JWT using `JwtService`, loads the user with `UserDetailsServiceImpl`, and then calls `accessor.setUser(auth)`. That attaches the authenticated user to the WebSocket session. Later, `ChatController.sendMessage()` receives `Principal principal` from that WebSocket session.

Finish:

> Subscription frames are also checked. If a user subscribes to `/topic/chat/{id}`, `authorizeSubscription()` verifies through `ConversationService.getConversationForMessage()` that the user belongs to that conversation. This prevents users from guessing topic names and listening to private chats.

## 27. Interview Answer: Sending A Message

Say it like this:

> When the user types a message and submits, `app.js` runs `doSend()` and sends a STOMP message to `/app/chat.sendMessage`. Spring maps that to `ChatController.sendMessage()` because of `@MessageMapping("/chat.sendMessage")`.

Continue:

> The method receives `ChatMessageRequestDTO` and `Principal`. The DTO validates message content and conversation ID, but the backend does not trust the sender field from the client. Instead, it gets the sender email from `principal.getName()`, loads the real user from `UserRepository`, and checks that this user belongs to the conversation using `ConversationService.getConversationForMessage()`.

Finish:

> If the check passes, it builds a `ChatMessage`, saves it through `ChatService.saveChatMessage()`, converts it to `ChatMessageResponseDTO`, and broadcasts it to `/topic/chat/{conversationId}`. Both users subscribed to that topic receive the message immediately. It also broadcasts a conversation update to each participant's sidebar topic.

## 28. Interview Answer: Conversation Creation

Say it like this:

> To start a chat, the frontend first searches a user by public ID using `GET /api/users/public/{publicId}`. If the user exists, it sends `POST /api/conversations` with `otherPublicId`. The backend does not accept the current user from the body. `ConversationController` uses `principal.getName()`, which comes from the verified JWT.

Continue:

> `ConversationService.getOrCreateConversation()` resolves the current user, finds the other user by public ID, prevents creating a conversation with yourself, then calls `ConversationRepository.findBetweenUsers()` to check both participant orders. If a conversation already exists, it returns that. Otherwise it saves a new `Conversation`.

Finish:

> After returning the DTO, the controller broadcasts that conversation to both users' `/topic/users/{publicId}/conversations` topics so their sidebars update in real time.

## 29. Important "Why" Decisions

### Why use email in JWT subject?

Because email is the login identity and is unique. It lets the backend load the current user on each request.

### Why not trust username/publicId from frontend?

Because the frontend can be modified by anyone. The trusted identity is the one extracted from a verified JWT.

### Why have both REST and WebSocket?

REST is better for normal request/response actions:

```text
login
profile
conversation list
message history
presence lookup
```

WebSocket is needed for live server push:

```text
new message
conversation sidebar update
online/offline event
```

### Why validate conversation membership repeatedly?

Because knowing a conversation ID should not be enough to access it. The backend checks membership before:

```text
reading message history
sending a message
subscribing to live message topic
```

### Why have TokenBlocklist?

JWTs normally remain valid until expiry. The blocklist gives logout a server-side effect by rejecting a token before its natural expiration.

### Why is TokenBlocklist in memory?

This is simpler for a single-server project. In a multi-server production setup, it should move to Redis or another shared store.

### Why is presence in memory?

Presence is based on active WebSocket sessions in the current server process. This is fine for a simple deployment, but multi-instance deployments need shared presence storage.

## 30. Things To Be Honest About

Mention these if asked about improvements:

```text
1. README is outdated because it still lists JWT as future work.

2. CreateConversationRequestDTO still has currentUser, but the secure code ignores it.

3. TokenBlocklist is in memory, so logout revocation is not shared across app instances.

4. Presence is in memory, so online/offline state is not shared across app instances.

5. The app uses Spring's simple in-memory WebSocket broker. For scale, use RabbitMQ or another broker.

6. There is no refresh token flow. When JWT expires, the user must log in again.

7. ddl-auto=update is convenient for development. Production should use Flyway or Liquibase.
```

## 31. The Short Mental Model

If you get nervous, remember this:

```text
Login:
    DTO validation -> rate limit -> DB user lookup -> BCrypt check -> JWT generated -> frontend stores token

Protected REST:
    authFetch sends Bearer token -> JwtAuthFilter verifies -> SecurityContext gets Authentication -> Principal works

WebSocket:
    CONNECT sends Bearer token -> WebSocketAuthInterceptor verifies -> accessor.setUser(auth) -> Principal works in message handlers

Conversation:
    Current user from Principal -> other user from publicId -> check existing conversation -> create or return

Message:
    Client sends to /app/chat.sendMessage -> backend uses Principal as sender -> checks conversation membership -> saves -> broadcasts to /topic/chat/{id}
```

One sentence summary:

```text
The project is built around one rule: client data is only input, but identity always comes from the verified JWT.
```
