package com.project.livechat.entity;

import com.project.livechat.chat.ChatMessage;
import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.util.List;

/**
 * JPA entity for the `users` table.
 * Stores credentials, a public-facing ID, a display name,
 * and an optional avatar accent color chosen by the user.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @NotBlank
    private String username;

    @Email
    @Column(unique = true, nullable = false)
    private String email;

    /** Short alphanumeric code shared with other users to start conversations. */
    @Column(unique = true, length = 10)
    private String publicId;

    /** BCrypt-hashed password — never stored in plaintext. */
    private String password;

    /**
     * Hex color string (e.g. "#7C5CFF") used as the avatar background.
     * Defaults to null; the frontend falls back to a gradient when absent.
     */
    private String avatarColor;

    /** All messages sent by this user — mapped via ChatMessage.sender. */
    @OneToMany(mappedBy = "sender", fetch = FetchType.LAZY)
    private List<ChatMessage> messages;
}
