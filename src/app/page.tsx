import ChatWindow from "@/components/ChatWindow";

export default function Home() {
  return (
    <ChatWindow
      apiRoute="/api/chat"
      requiresAuth
      placeholder="What are you in the mood for?"
    />
  );
}
