import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { errorLogger } from "@/lib/errorLogger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    errorLogger.logApiError('route_not_found', new Error(`404: ${location.pathname}`), {
      pathname: location.pathname,
    });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Pagina niet gevonden</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Terug naar startpagina
        </a>
      </div>
    </div>
  );
};

export default NotFound;
