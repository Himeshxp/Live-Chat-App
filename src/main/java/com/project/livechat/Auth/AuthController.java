package com.project.livechat.Auth;


import com.project.livechat.entity.User;
import com.project.livechat.entity.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    private final UserRepository userRepository;

    @PostMapping("/register")
    public User registerUser(@RequestBody User user){
        return userRepository.save(user);

    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(
            @RequestParam String email,
            @RequestParam String password
    ) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "User not found"));
        }
        if (!user.getPassword().equals(password)) {
            return ResponseEntity.status(401).body(Map.of("message", "Invalid Password"));
        }
        return ResponseEntity.ok(Map.of(
                "message", "Login Successful",
                "username", user.getUsername()
        ));
    }

}
