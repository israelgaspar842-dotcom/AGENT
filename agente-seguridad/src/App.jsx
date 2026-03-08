import AgenteSeguridad from "./AgenteSeguridad";

function App() {
  // 1. Leemos la URL actual de la barra del navegador
  const queryParams = new URLSearchParams(window.location.search);
  
  // 2. Buscamos las palabras clave "conductor" y "placa" en ese link
  const nombreConductor = queryParams.get("conductor");
  const placaVehiculo = queryParams.get("placa");

  // 3. Renderizamos el diseño de tu amigo, inyectándole los datos
  return (
    <AgenteSeguridad 
      conductorNFC={nombreConductor} 
      placaNFC={placaVehiculo} 
    />
  );
}

export default App;