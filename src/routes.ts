import { index, route } from "@react-router/dev/routes";

export default [
  index("./App.tsx"),
  route("/chat", "./Chat/Chat.tsx"),
];