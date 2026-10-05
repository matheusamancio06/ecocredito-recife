import type { Metadata } from "next";
import { OperatorDesk, type DeskMaterial } from "@/components/OperatorDesk";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listRates } from "@/lib/credits";
import { MATERIAL_CATEGORY, POINT_CATEGORY_LABEL, POINT_KIND_LABEL } from "@/lib/domain";
import { getPoint } from "@/lib/points";

export const metadata: Metadata = { title: "Atendimento do ponto" };

export default async function OperatorPage() {
  const user = await requireUser("OPERADOR");
  const point = user.pointId ? await getPoint(user.pointId) : null;

  if (!point || !point.staffed) {
    return (
      <div className="mx-auto max-w-xl">
        <PageTitle title="Atendimento do ponto" subtitle="Seu usuário ainda não está vinculado a um ponto com atendente." />
      </div>
    );
  }

  const rates = await listRates();
  const materials: DeskMaterial[] = rates
    .filter((r) => point.accepts.includes(MATERIAL_CATEGORY[r.material]))
    .map((r) => ({ value: r.material, label: r.label, unit: r.unit, pointsPerUnit: r.pointsPerUnit }));

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle
        title={point.name}
        subtitle={`${POINT_KIND_LABEL[point.kind]}${point.neighborhood ? ` · ${point.neighborhood}` : ""}`}
      />
      <p className="mb-5 text-sm text-ink-muted">
        Recebe: {point.accepts.map((a) => POINT_CATEGORY_LABEL[a]).join(", ")}.
      </p>
      {materials.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-center text-ink-muted">
          Este ponto não recebe materiais que geram EcoCoins.
        </p>
      ) : (
        <OperatorDesk materials={materials} />
      )}
    </div>
  );
}
