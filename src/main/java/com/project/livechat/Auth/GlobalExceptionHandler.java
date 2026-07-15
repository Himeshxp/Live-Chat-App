package com.project.livechat.Auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Centralised error handling for the entire application.
 *
 * Rules:
 *  - Stack traces are NEVER exposed in HTTP responses.
 *  - Sensitive errors (bad credentials, user not found) return a generic message
 *    to prevent user-enumeration attacks; the real detail is logged server-side.
 *  - Validation errors list all failing fields so clients can surface them in forms.
 *  - A catch-all handler ensures no raw exception ever reaches the client.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // -----------------------------------------------------------------------
    // 409 Conflict — duplicate email on registration
    // -----------------------------------------------------------------------
    @ExceptionHandler(DuplicateEmailException.class)
    public ResponseEntity<Map<String, String>> handleDuplicateEmail(DuplicateEmailException ex) {
        log.warn("Duplicate email registration attempt: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(error(ex.getMessage()));
    }

    // -----------------------------------------------------------------------
    // 401 Unauthorized — wrong credentials
    // Unified message prevents user enumeration (client cannot tell whether
    // the email doesn't exist or the password is wrong).
    // -----------------------------------------------------------------------
    @ExceptionHandler({UsernameNotFoundException.class, BadCredentialsException.class})
    public ResponseEntity<Map<String, String>> handleAuthFailure(RuntimeException ex) {
        // Log the real reason server-side for monitoring, never send it to the client
        log.warn("Authentication failure: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(error("Invalid email or password"));
    }

    // -----------------------------------------------------------------------
    // 400 Bad Request — @Valid constraint violations
    // Returns a map of { field: "violation message" } for all failing fields.
    // -----------------------------------------------------------------------
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            // Keep only the first error per field for a clean response
            fieldErrors.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "Validation failed");
        body.put("fields", fieldErrors);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // -----------------------------------------------------------------------
    // 404 Not Found — no handler / no static resource
    // -----------------------------------------------------------------------
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNoResource(NoResourceFoundException ex) {
        log.debug("Resource not found: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(error("The requested resource was not found"));
    }

    // -----------------------------------------------------------------------
    // 500 Internal Server Error — anything unexpected
    // Logs the full exception internally; returns a safe, opaque message.
    // -----------------------------------------------------------------------
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleAll(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(error("An unexpected error occurred. Please try again later."));
    }

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------
    private Map<String, String> error(String message) {
        return Map.of("error", message);
    }
}
