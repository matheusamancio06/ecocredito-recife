import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { CONSENT_VERSION } from "@/lib/domain";

export const metadata: Metadata = { title: "Aviso de privacidade" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-1 space-y-2 text-base leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Aviso de privacidade"
        subtitle={`Versão ${CONSENT_VERSION}. Protótipo acadêmico, sem vínculo oficial com a Prefeitura do Recife.`}
      />

      <Card>
        <Section title="O que é coletado">
          <p>
            Ao entrar, o sistema recebe do gov.br apenas o seu nome e o seu CPF já verificados. O CPF não é guardado:
            o que fica salvo é um código derivado dele, que serve para reconhecer você no próximo acesso e não permite
            recuperar o número.
          </p>
          <p>
            Ao registrar um entulho, ficam guardados: a foto, o ponto marcado no mapa, o ponto de referência ou a
            observação que você escrever, além da data e hora.
          </p>
          <p>
            Nas entregas de recicláveis ficam o material, o peso conferido pelo operador, o ponto de recebimento e os
            EcoCoins creditados.
          </p>
        </Section>

        <Section title="Para que é usado">
          <p>
            Para que a gestão de coleta localize o entulho, remova e dê baixa no registro, e para creditar os EcoCoins
            das entregas de recicláveis. Os números de resumo que a gestão vê são sempre agregados.
          </p>
        </Section>

        <Section title="A foto">
          <p>
            A foto é reduzida no seu aparelho antes do envio, e no servidor os metadados são removidos — inclusive a
            coordenada de GPS que a câmera grava. A localização que vale é a que você marcou no mapa.
          </p>
          <p>
            Nenhuma análise automática é feita na foto. Evite fotografar pessoas e placas de veículos. A foto pode ser
            vista por quem registrou ou confirmou o entulho e pela gestão de coleta — nunca por qualquer pessoa com o
            endereço da imagem.
          </p>
        </Section>

        <Section title="Com quem é compartilhado">
          <p>
            Com a gestão de coleta, que precisa do ponto e da foto para remover o entulho, e com o operador do ponto de
            recebimento, que vê seu nome no momento em que confere o seu código. Nada é vendido nem usado para
            publicidade.
          </p>
        </Section>

        <Section title="Por quanto tempo">
          <p>
            Os registros de entulho ficam guardados enquanto forem úteis para o planejamento da coleta e para a
            prestação de contas do serviço. Os códigos de EcoCoins são apagados junto com a conta.
          </p>
        </Section>

        <Section title="Seus direitos">
          <p>
            Você pode ver e baixar tudo o que o sistema guarda sobre você e encerrar a sua conta a qualquer momento em{" "}
            <Link href="/minha-conta" className="font-semibold text-brand-strong underline">
              Minha conta
            </Link>
            .
          </p>
          <p>
            Ao encerrar a conta, o vínculo com você é removido: nome, identificador do gov.br e código do CPF são
            apagados. Os registros de entulho permanecem sem dono identificado, porque registram um problema em via
            pública e embasam o serviço de coleta — a base legal deles é a execução de política pública, não o seu
            consentimento (LGPD, art. 7º, III, e art. 16, I).
          </p>
        </Section>

        <Section title="Quem responde">
          <p>
            Em um sistema oficial, este espaço traria o órgão responsável (controlador) e o contato do Encarregado de
            Dados (DPO) da Prefeitura, além do Relatório de Impacto à Proteção de Dados (RIPD) do serviço. Como este é
            um protótipo acadêmico, esses papéis ainda não existem e nenhum dado real deve ser enviado aqui.
          </p>
        </Section>
      </Card>
    </div>
  );
}
