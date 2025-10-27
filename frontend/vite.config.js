import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        feed: resolve(__dirname, "feed.html"),
        map: resolve(__dirname, "map.html"),
        upload: resolve(__dirname, "upload.html"),
        leaderboard: resolve(__dirname, "leaderboard.html"),
        profile: resolve(__dirname, "profile.html"),
        login: resolve(__dirname, "login.html"),
        signup: resolve(__dirname, "signup.html"),
        ngo_login: resolve(__dirname, "ngo_login.html"),
        ngo_signup: resolve(__dirname, "ngo_signup.html"),
      },
    },
  },
});
