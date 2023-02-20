export const ev = (name: string, fallback: any = null) => {
    return process.env.hasOwnProperty(name) ? process.env[name] : fallback
}