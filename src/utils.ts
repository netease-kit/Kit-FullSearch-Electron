export const queuePromise = (
  fn: (...args: any) => Promise<any>
): ((...args: any) => Promise<any>) => {
  const queue: any = []
  let lock = false
  return function (...args: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      queue.push({
        fn,
        args: [...args],
        resolve,
        reject,
      })
      if (lock) {
        return
      }
      lock = true
      while (queue.length) {
        const cur = queue.shift()
        try {
          // @ts-ignore
          const res = await cur.fn.apply(this, cur.args)
          cur.resolve(res)
        } catch (error) {
          cur.reject(error)
        }
      }
      lock = false
    })
  }
}
