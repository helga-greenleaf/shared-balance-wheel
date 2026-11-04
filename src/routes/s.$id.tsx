import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Centered, WheelSession } from "@/components/wheel/WheelSession";
import { readStored } from "@/lib/wheel/sync";

export const Route = createFileRoute("/s/$id")({
  head: () => ({
    meta: [
      { title: "Колесо баланса — сессия" },
      { name: "description", content: "Совместная работа с колесом баланса по ссылке." },
      { property: "og:title", content: "Колесо баланса — сессия" },
      { property: "og:description", content: "Совместная работа с колесом баланса по ссылке." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { id } = Route.useParams();
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const m = /(?:^|[#&])k=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setSecret(m ? m[1] : (readStored(id)?.secret ?? null));
  }, [id]);
  if (secret === undefined) return <Centered title="Загружаем колесо…" />;
  if (!/^[0-9a-f-]{36}$/.test(id) || !secret)
    return (
      <Centered title="Нет ключа доступа">
        В ссылке нет ключа доступа. Попросите у участника сессии полную ссылку через «Поделиться».
      </Centered>
    );
  return <WheelSession key={id} id={id} secret={secret} />;
}
