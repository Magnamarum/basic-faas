function start(identity, functionName) {
  const func = require("./" + functionName);
  console.log(func(process.argv[2]));
}
start("prueba", "echo.ts");
