import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
        // Don't accidentally pick up unit tests inside the Next.js build output.
        exclude: ["node_modules", ".next", "dist"],
        globals: false,
        passWithNoTests: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/lib/**/*.ts", "src/app/[locale]/**/actions.ts"],
            exclude: ["**/*.d.ts", "**/types/**"],
        },
    },
});
