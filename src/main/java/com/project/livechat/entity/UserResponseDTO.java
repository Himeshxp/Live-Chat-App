package com.project.livechat.entity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserResponseDTO(
        @NotBlank
        @Size(min = 3, max = 20)
        String username,
        String publicId,
        @Email
        String email
) {
}
