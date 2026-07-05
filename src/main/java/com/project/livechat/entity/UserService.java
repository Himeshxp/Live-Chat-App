package com.project.livechat.entity;


import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository repo;

    public UserResponseDTO findByPublicId(String publicId) {
        return repo.findByPublicId(publicId)
                .map(user -> new UserResponseDTO(user.getUsername(), user.getPublicId(), user.getEmail()))
                .orElseThrow(() -> new IllegalArgumentException("User not found with publicId: " + publicId));
    }
}
