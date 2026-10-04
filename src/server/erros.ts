/**
 * Erro previsto pelas regras do sistema: transição proibida, OS não
 * encontrada, mudança simultânea etc. A mensagem é escrita para o
 * usuário e pode ser mostrada na tela.
 *
 * Qualquer outro erro é inesperado: a tela mostra só uma mensagem
 * genérica e o detalhe fica no log do servidor.
 */
export class ErroDeRegra extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeRegra";
  }
}