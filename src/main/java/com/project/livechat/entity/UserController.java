package com.project.livechat.entity;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

/**
 * REST endpoints for user profile operations.
 * CORS and security are handled globally — no @CrossOrigin here.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** Look up any user's public profile by their public ID (used for starting conversations). */
    @GetMapping("/public/{publicId}")
    public UserResponseDTO getUserByPublicId(@PathVariable String publicId) {
        return userService.findByPublicId(publicId);
    }

    /**
     * Get the currently-authenticated user's own profile.
     * Principal is injected by Spring Security from the JWT.
     */
    @GetMapping("/me")
    public UserResponseDTO getMyProfile(Principal principal) {
        return userService.findByEmail(principal.getName());
    }

    /**
     * Update username and/or avatarColor for the authenticated user.
     * Only the fields provided in the request body are changed.
     */
    @PatchMapping("/me")
    public ResponseEntity<UserResponseDTO> updateProfile(
            @RequestBody @Valid UpdateProfileRequest request,
            Principal principal
    ) {
        UserResponseDTO updated = userService.updateProfile(principal.getName(), request);
        return ResponseEntity.ok(updated);
    }
}
