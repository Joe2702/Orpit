package com.orbit.app;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App lock: the phone's own unlock, asked for by Orbit.
 *
 * Uses the system prompt, so whatever the phone is set up with works:
 * fingerprint, face, or the screen-lock PIN, pattern or password. Orbit never
 * sees or stores any of it; it only learns whether the person passed. No PIN
 * of Orbit's own, either: one more code to forget is how people get locked out
 * of their own data.
 */
@CapacitorPlugin(name = "OrbitLock")
public class OrbitLock extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    /** Whether the phone has any screen lock this can use. */
    @PluginMethod
    public void available(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject out = new JSObject();
        out.put("available", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(out);
    }

    /** Show the system prompt. Resolves { ok } either way; cancelling is not an error. */
    @PluginMethod
    public void unlock(PluginCall call) {
        final String reason = call.getString("reason", "Your money and habits are behind this.");
        getActivity().runOnUiThread(() -> {
            try {
                BiometricPrompt prompt = new BiometricPrompt(
                    (FragmentActivity) getActivity(),
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            JSObject out = new JSObject();
                            out.put("ok", true);
                            call.resolve(out);
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence message) {
                            JSObject out = new JSObject();
                            out.put("ok", false);
                            out.put("message", message == null ? "" : message.toString());
                            call.resolve(out);
                        }
                        // onAuthenticationFailed (a finger that didn't match) leaves the
                        // prompt open for another try, so it resolves nothing.
                    }
                );
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Orbit")
                    .setSubtitle(reason)
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .build();
                prompt.authenticate(info);
            } catch (Exception e) {
                call.reject("Could not show the unlock prompt: " + e.getMessage());
            }
        });
    }
}
