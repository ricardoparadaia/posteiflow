import { InstagramSettings } from "@/components/app/instagram-settings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuração</h1>
        <p className="text-sm text-muted-foreground">Status da conexão com o Instagram e gestão do token.</p>
      </div>

      <InstagramSettings />
    </div>
  );
}
