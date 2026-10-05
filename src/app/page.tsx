import Link from "next/link";
import { HOME_BY_ROLE, getCurrentUser } from "@/lib/auth";

const STEPS = [
  {
    title: "Registre o entulho",
    text: "Viu entulho jogado na rua? Tire uma foto e marque o ponto no mapa. Se alguém já registrou o mesmo lugar, você só confirma.",
  },
  {
    title: "A gestão de coleta dá baixa",
    text: "A equipe de coleta vê os registros abertos, remove o entulho e dá baixa. Você acompanha o resultado em Meus registros.",
  },
  {
    title: "Recicle e acumule EcoCoins",
    text: "Leve recicláveis a uma cooperativa ou ecoestação, mostre o QR Code e ganhe EcoCoins pelo peso conferido.",
  },
];

export default async function HomePage(props: PageProps<"/">) {
  const user = await getCurrentUser();
  const params = await props.searchParams;

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-12">
      {params.conta === "encerrada" && (
        <p role="status" className="mb-4 rounded-2xl bg-st-ok-bg p-4 font-semibold text-st-ok">
          Sua conta foi encerrada e seus dados pessoais foram apagados. Obrigado por ter contribuído.
        </p>
      )}
      <p className="mb-3 inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-bold text-brand-strong">
        Gestão digital de resíduos sólidos urbanos
      </p>
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
        Descartar certo tem que ser mais fácil do que descartar errado.
      </h1>
      <p className="mt-4 text-lg text-ink-muted">
        Duas ferramentas simples contra o descarte irregular no Recife: registrar o entulho que aparece na rua e ganhar
        EcoCoins por reciclar.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        {user ? (
          <Link
            href={HOME_BY_ROLE[user.role]}
            className="inline-flex min-h-12 items-center rounded-xl bg-brand px-6 text-base font-bold text-ink hover:brightness-95"
          >
            Continuar como {user.displayName.split(" ")[0]}
          </Link>
        ) : (
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center rounded-xl bg-brand px-6 text-base font-bold text-ink hover:brightness-95"
          >
            Entrar com gov.br
          </Link>
        )}
      </div>

      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-line bg-white p-4">
            <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-extrabold text-ink">
              {index + 1}
            </span>
            <h2 className="mt-3 text-lg font-bold">{step.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
