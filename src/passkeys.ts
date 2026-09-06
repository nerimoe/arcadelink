export function passkeyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "未完成 Passkey 验证，请重试或稍后设置";
    if (error.name === "InvalidStateError") return "这个 Passkey 已经添加过了";
    if (error.name === "SecurityError") return "当前环境无法使用 Passkey";
    return error.message;
  }
  return "Passkey 操作失败";
}
