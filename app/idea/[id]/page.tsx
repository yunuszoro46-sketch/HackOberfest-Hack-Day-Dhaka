"use client";

import { use } from "react";
import { IdeaProvider } from "@/lib/client/IdeaContext";
import { Workspace } from "@/components/stages/Workspace";

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <IdeaProvider id={id}>
      <Workspace />
    </IdeaProvider>
  );
}
