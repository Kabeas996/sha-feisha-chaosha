import { createOnlineServer } from "./online/createOnlineServer.ts";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const { httpServer } = createOnlineServer();

httpServer.listen(port, host, () => {
  console.log(`Game server listening on http://${host}:${port}`);
});
