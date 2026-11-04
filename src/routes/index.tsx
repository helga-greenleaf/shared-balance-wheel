import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Centered } from "@/components/wheel/WheelSession";
import { createSession } from "@/lib/wheel/session.functions";
import { LAST_KEY, rememberSession } from "@/lib/wheel/sync";
import { todayLocal } from "@/lib/wheel/model";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Колесо баланса — инструмент для коучинговых сессий" },
      {
        name: "description",
        content: "Заполняйте колесо баланса вместе с коучем по одной ссылке и скачивайте PDF для рабочей тетради.",
      },
      { property: "og:title", content: "Колесо баланса" },
      {
        property: "og:description",
        content: "Совместное колесо баланса для коучинга: «Сейчас» и «После продвижения», PDF А4.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [error, setError] = useState(false);
  const start = async () => {
    setError(false);
    try {
      const r = await createSession({ data: { date: todayLocal() } });
      rememberSession(r.id, r.secret);
      window.location.replace(`/s/${r.id}#k=${r.secret}`);
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as { id: string; secret: string } | null;
      if (last?.id && last?.secret) {
        window.location.replace(`/s/${last.id}#k=${last.secret}`);
        return;
      }
    } catch {
      /* ignore */
    }
    void start();
  }, []);
  if (error)
    return (
      <Centered title="Не удалось создать колесо">
        Проверьте соединение.
        <div className="mt-4">
          <Button onClick={start}>Попробовать снова</Button>
        </div>
      </Centered>
    );
  return <Centered title="Готовим колесо баланса…" />;
}
