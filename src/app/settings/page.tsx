import { InstagramSettings } from "@/components/app/instagram-settings";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">Configuração</h1>
        <p className="mt-1 text-sm text-[#75718F]">Status da conexão com o Instagram e gestão do token</p>
      </div>

      <InstagramSettings />
    </div>
  );
}
