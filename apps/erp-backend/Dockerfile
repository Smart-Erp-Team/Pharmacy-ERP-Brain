# Stage 1: Restore and build the .NET 10 application
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj files first to leverage Docker layer caching for NuGet restore
COPY apps/erp-backend/src/PharmacyERP.Api/PharmacyERP.Api.csproj apps/erp-backend/src/PharmacyERP.Api/
COPY apps/erp-backend/src/PharmacyERP.Application/PharmacyERP.Application.csproj apps/erp-backend/src/PharmacyERP.Application/
COPY apps/erp-backend/src/PharmacyERP.Domain/PharmacyERP.Domain.csproj apps/erp-backend/src/PharmacyERP.Domain/
COPY apps/erp-backend/src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj apps/erp-backend/src/PharmacyERP.Infrastructure/

# Restore NuGet packages
RUN dotnet restore apps/erp-backend/src/PharmacyERP.Api/PharmacyERP.Api.csproj

# Copy shared contracts and backend source code
COPY contracts ./contracts
COPY apps/erp-backend ./apps/erp-backend

# Build and publish the API project in Release mode
WORKDIR /src/apps/erp-backend/src/PharmacyERP.Api
RUN dotnet publish PharmacyERP.Api.csproj -c Release -o /app/publish --no-restore

# Stage 2: Lightweight runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Copy published binaries from the build stage
COPY --from=build /app/publish .

# ASP.NET Core default HTTP port inside containers is 8080
EXPOSE 8080

# Start the .NET API
ENTRYPOINT ["dotnet", "PharmacyERP.Api.dll"]