import ChatWindow from "@/components/ChatWindow";

export default function Home() {
  return (
    <ChatWindow
      title="Meal Prep Chat"
      apiRoute="/api/chat"
      placeholder="What's in your fridge?"
      links={[
        { href: "/pantry", label: "My Pantry" },
        { href: "/recipes", label: "Recipe Suggestions (pantry-aware)" },
      ]}
    />
  );
}
