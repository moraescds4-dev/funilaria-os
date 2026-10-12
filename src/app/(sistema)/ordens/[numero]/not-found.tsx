import Link from "next/link";

/** Mostrado quando o número da OS é inválido ou não existe (notFound()). */
export default function OrdemNaoEncontrada() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center">
      <h1 className="text-xl font-bold text-gray-900">OS não encontrada</h1>
      <p className="text-sm text-gray-600">
        Confira o número da ordem de serviço. Ela pode ter sido digitada errada no endereço.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
      >
        Voltar ao quadro
      </Link>
    </section>
  );
}