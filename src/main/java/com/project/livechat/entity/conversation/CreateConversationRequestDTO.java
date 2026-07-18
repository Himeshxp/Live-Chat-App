package com.project.livechat.entity.conversation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record CreateConversationRequestDTO(
        String currentUser,

        @NotBlank(message = "Public ID is required")
        @Pattern(regexp = "^[A-Z0-9]{8,10}$", message = "Public ID must be uppercase letters and digits")
        String otherPublicId
) {
}
