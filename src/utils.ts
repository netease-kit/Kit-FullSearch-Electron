/* eslint-disable @typescript-eslint/explicit-function-return-type */
export function promisify(func, instance) {
  return (...arg: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, ...arg, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
}

export function promisifyForDone(func, instance) {
  return (obj: any) =>
    new Promise((resolve, reject) => {
      func.call(instance, {
        ...obj,
        done(err, result) {
          if (err) reject(err)
          else resolve(result)
        },
      })
    })
}
