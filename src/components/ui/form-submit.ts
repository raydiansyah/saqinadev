import type { FormEvent } from "react";

/**
 * An onSubmit handler that reads the form and leaves it as typed. A form `action` is reset by
 * React when it finishes, so a save that fails would put the old values back and lose what the
 * person typed; here the fields stay until the server accepts them.
 */
export const onSubmitData =
  (handler: (data: FormData) => void) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handler(new FormData(event.currentTarget));
  };
