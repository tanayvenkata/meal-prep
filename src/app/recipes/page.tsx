import ChatWindow from "@/components/ChatWindow";

export default function Recipes() {
  return (
    <ChatWindow
      title="Recipe Suggestions"
      apiRoute="/api/recipes"
      placeholder="What are you in the mood for?"
      links={[
        { href: "/", label: "Regular Chat" },
        { href: "/pantry", label: "My Pantry" },
      ]}
    />
  );
}
