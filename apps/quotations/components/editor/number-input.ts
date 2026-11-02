export function setNumber(
  value: string,
  apply: (value: string) => void,
  percent = false,
) {
  if (
    /^(?:\d{1,9}(?:\.\d{0,2})?)?$/.test(value) &&
    (!percent || Number(value) <= 100)
  )
    apply(value);
}
