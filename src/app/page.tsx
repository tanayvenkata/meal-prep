import ChatWindow from "@/components/ChatWindow";

export default function Home() {
  return (
    <ChatWindow
      title="Meal Prep"
      apiRoute="/api/recipes"
      requiresAuth
      placeholder="What are you in the mood for?"
      links={[{ href: "/pantry", label: "My Pantry" }]}
    />
  );
}
