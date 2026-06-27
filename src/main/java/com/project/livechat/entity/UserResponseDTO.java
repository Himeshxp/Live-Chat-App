package com.project.livechat.entity;

import jakarta.validation.constraints.Email;

public record UserResponseDTO(
        String username,
        @Email
        String email
) {
}
