// vite.config.ts
import { TanStackRouterVite } from "file:///I:/pockapp/node_modules/@tanstack/router-plugin/dist/esm/vite.js";
import react from "file:///I:/pockapp/node_modules/@vitejs/plugin-react-swc/index.js";
import { defineConfig, loadEnv } from "file:///I:/pockapp/node_modules/vite/dist/node/index.js";
import topLevelAwait from "file:///I:/pockapp/node_modules/vite-plugin-top-level-await/exports/import.mjs";
import wasm from "file:///I:/pockapp/node_modules/vite-plugin-wasm/exports/import.mjs";
import tsconfigPaths from "file:///I:/pockapp/node_modules/vite-tsconfig-paths/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL || "http://localhost:8090";
  return {
    plugins: [
      tsconfigPaths(),
      TanStackRouterVite({
        routesDirectory: "frontend/routes",
        generatedRouteTree: "frontend/routeTree.gen.ts"
      }),
      wasm(),
      topLevelAwait(),
      react()
    ],
    build: {
      outDir: "./dist",
      emptyOutDir: true
    },
    server: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJJOlxcXFxwb2NrYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJJOlxcXFxwb2NrYXBwXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9JOi9wb2NrYXBwL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgVGFuU3RhY2tSb3V0ZXJWaXRlIH0gZnJvbSAnQHRhbnN0YWNrL3JvdXRlci1wbHVnaW4vdml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0LXN3YydcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHRvcExldmVsQXdhaXQgZnJvbSAndml0ZS1wbHVnaW4tdG9wLWxldmVsLWF3YWl0J1xyXG5pbXBvcnQgd2FzbSBmcm9tICd2aXRlLXBsdWdpbi13YXNtJ1xyXG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJ1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xyXG5cdGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXHJcblxyXG5cdC8vIERlZmF1bHQgYmFja2VuZCBVUkwgaWYgbm90IHNldFxyXG5cdGNvbnN0IGJhY2tlbmRVcmwgPSBlbnYuVklURV9CQUNLRU5EX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDo4MDkwJ1xyXG5cclxuXHRyZXR1cm4ge1xyXG5cdFx0cGx1Z2luczogW1xyXG5cdFx0XHR0c2NvbmZpZ1BhdGhzKCksXHJcblx0XHRcdFRhblN0YWNrUm91dGVyVml0ZSh7XHJcblx0XHRcdFx0cm91dGVzRGlyZWN0b3J5OiAnZnJvbnRlbmQvcm91dGVzJyxcclxuXHRcdFx0XHRnZW5lcmF0ZWRSb3V0ZVRyZWU6ICdmcm9udGVuZC9yb3V0ZVRyZWUuZ2VuLnRzJyxcclxuXHRcdFx0fSksXHJcblx0XHRcdHdhc20oKSxcclxuXHRcdFx0dG9wTGV2ZWxBd2FpdCgpLFxyXG5cdFx0XHRyZWFjdCgpLFxyXG5cdFx0XSxcclxuXHRcdGJ1aWxkOiB7XHJcblx0XHRcdG91dERpcjogJy4vZGlzdCcsXHJcblx0XHRcdGVtcHR5T3V0RGlyOiB0cnVlLFxyXG5cdFx0fSxcclxuXHRcdHNlcnZlcjoge1xyXG5cdFx0XHRwcm94eToge1xyXG5cdFx0XHRcdCcvYXBpJzoge1xyXG5cdFx0XHRcdFx0dGFyZ2V0OiBiYWNrZW5kVXJsLFxyXG5cdFx0XHRcdFx0Y2hhbmdlT3JpZ2luOiB0cnVlLFxyXG5cdFx0XHRcdH0sXHJcblx0XHRcdH0sXHJcblx0XHR9LFxyXG5cdH1cclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFvTixTQUFTLDBCQUEwQjtBQUN2UCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxjQUFjLGVBQWU7QUFDdEMsT0FBTyxtQkFBbUI7QUFDMUIsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sbUJBQW1CO0FBRTFCLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ3pDLFFBQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUczQyxRQUFNLGFBQWEsSUFBSSxvQkFBb0I7QUFFM0MsU0FBTztBQUFBLElBQ04sU0FBUztBQUFBLE1BQ1IsY0FBYztBQUFBLE1BQ2QsbUJBQW1CO0FBQUEsUUFDbEIsaUJBQWlCO0FBQUEsUUFDakIsb0JBQW9CO0FBQUEsTUFDckIsQ0FBQztBQUFBLE1BQ0QsS0FBSztBQUFBLE1BQ0wsY0FBYztBQUFBLE1BQ2QsTUFBTTtBQUFBLElBQ1A7QUFBQSxJQUNBLE9BQU87QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLGFBQWE7QUFBQSxJQUNkO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTixRQUFRO0FBQUEsVUFDUCxRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
